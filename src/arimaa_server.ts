import { request, connection, server, IMessage } from "websocket";
//import {Msg, Maybe, GameState, Board, BoardSetup, State, Player, Move, Trapped} from "./arimaa_alt"


const WebSocketServer = require('websocket').server;
const http = require('http');

// Helper / debug functions

function log_circular(ob: any) {
    var cache: any[] = []
    function render(key: any, value: any) {
        if (typeof value === 'object' && value !== null) {
            if (cache.indexOf(value) !== -1) {
                // Duplicate reference found
                try {
                    // If this value does not reference a parent it can be deduped
                    return JSON.parse(JSON.stringify(value));
                } catch (error) {
                    // discard key if value cannot be deduped
                    return;
                }
            }
            // Store value in our collection
            cache.push(value);
        }
        return value;
    }

    console.log(ob, render, 2)
}

function info(s : string) : void
{
    console.log('\x1b[92m'+s+'\x1b[0m')
}

function error(s : string) : void
{
    console.log('\x1b[31m'+s+'\x1b[0m')
}

function warning(s : string) : void
{
    console.log('\x1b[93m'+s+'\x1b[0m')
}

// End of helper functions

interface Message
{
    type : Msg
}

type SideEntry = {id : string, connection : Maybe<connection>}

/**
 * Maintains information about sides, connections
 * and board history (to verify state reoccurences)
 *
 * Handles game messages and state updates
 */
class GameSession
{
    gs : GameState
    side : {white : SideEntry, black : SideEntry}
    conns : connection[] = []

    piece_setups : {white : Maybe<BoardSetup>, black : Maybe<BoardSetup>}
    side_choices : [connection, SideChoice][] = []

    // Any time a valid destructive move set is applied, clear the history
    // A destructive move is one where one or more pieces are trapped
    board_history : {board : Board, turn : Player, occurences : number}[][] = []

    constructor(gs : GameState)
    {
        this.gs = gs
        let id_w : number = Math.round(Math.random()*1024)
        let id_b : number
        do {
            id_b = Math.round(Math.random()*1024)
        } while (id_w == id_b);

        this.side = {
            white: { id: id_w.toString(), connection: undefined },
            black: { id: id_b.toString(), connection: undefined }
        }
        this.piece_setups = {white : undefined, black : undefined}
    }

    state () : State
    {
        return this.gs.state
    }

    set_state(s : State)
    {
        this.gs.state = s
    }

    /**
     * Returns true of the move set is destructive, meaning that at least
     * one piece is trapped, preventing any previous state from reoccuring
     * @param ms Set of moves to check
     */
    destructive(ms : Move[]) : boolean
    {
        for(let m of ms)
        {
            let t = m.move.trapped
            if(t instanceof Trapped && t.occupied)
                return true
            else if(!(t instanceof Trapped) && (t[0].occupied || t[1].occupied))
                return true
        }
        return false
    }

    /**
     * Validate a sequence of moves against the current game state, guarantees
     * @param moveset Move set to validate against the current game state
     */
    valid(moveset : Move[]) : boolean
    {
        if(moveset.length == 0 || this.state() > State.BlacksTurn || this.state() < State.WhitesTurn)
            return false
        let turn : Player = this.state() == State.WhitesTurn ? Player.White : Player.Black
        let cost = 0
        let tmp_board = this.gs.board.copy()
        for(let m of moveset)
        {
            if(cost + m.move.cost > 4 || !tmp_board.valid_move(m, turn))
                return false
            tmp_board.apply_move(m)
            cost += m.move.cost
        }
        return !tmp_board.equals(this.gs.board) && !this.state_reoccurence(tmp_board, turn)
    }

    /**
     * Ensure that the board state x player turn does not reoccur more than 3 times 
     * by keeping track of the pairs along with a counter. Return true if the state
     * would reoccur for the third time.
     * @param board Board state to test
     * @param turn Turn for which the board state repetition is checked
     */
    state_reoccurence(board : Board, turn : Player) : boolean
    {
        let hash = board.hash()
        let state_list = this.board_history[hash]
        let entry = {board : board.copy(), turn : turn, occurences : 1}

        if(state_list == undefined)
        {
            this.board_history[hash] = [entry]
            return false
        }
        else
        {
            for(let l of state_list)
            {
                if(l.turn == turn && l.board.equals(board))
                {
                    l.occurences++
                    return l.occurences > 2
                }
            }
            state_list.push(entry)
            return false
        }
    }

    send(conn : connection | Player, type : Msg, data : any)
    {
        if(typeof conn == "number")
        {
            if(conn == Player.White && this.side.white.connection)
                conn = this.side.white.connection
            else if(conn == Player.Black && this.side.black.connection)
                conn = this.side.black.connection
            else
                warning(`Failed to send message to ${Player[conn]}`)
        }
        if(conn instanceof connection)
            conn.sendUTF(JSON.stringify({type: type, data: data}))
        else
            warning(`Invalid connection for message: ${Msg[type]}, ${data}`)
    }

    send_state(conn : connection)
    {
        let data : any = {state: this.state()}
        if(this.state() > State.SidePick)
        {
             // Verify that the request is coming from a registered connection
            if(this.side.white.connection == conn)
                data.side = Player.White
            else if(this.side.black.connection == conn)
                data.side = Player.Black
            else
            {
                warning("Status requested from connection not registered to a side")
                return
            }
        }

        switch (this.state())
        {
            case State.PreGame:
            case State.SidePick:
                this.send(conn, Msg.StateSend, data)
                break
            case State.PieceSetup:
                if (this.side.black.connection == conn && this.piece_setups.white)
                    data.setup = this.piece_setups.white.to_json()
                this.send(conn, Msg.StateSend, data)
                break
            case State.WhitesTurn:
            case State.BlacksTurn:
            case State.WhiteWins:
            case State.BlackWins:
                data.gamestate = this.gs.to_json()
                this.send(conn, Msg.StateSend, data)
                break
            default:
                throw "Game state invalid"
        }
    }

    handle_side_choice(conn : connection, choice : SideChoice)
    {
        if(this.state() != State.SidePick)
        {
            warning("Received side choice message when not in side pick mode")
            return
        }

        let add = true
        for(let entry of this.side_choices)
        {
            if(entry[0] == conn)
            {
                entry[1] = choice
                add = false
                break
            }
        }
        if(add)
            this.side_choices.push([conn, choice])
        // If both players have chosen their preference, decide
        if(this.side_choices.length == 2)
        {
            let [c1, sc1] = this.side_choices[0]
            let [c2, sc2] = this.side_choices[1]
            let white : connection
            let black : connection

            if(sc1 == sc2)
                [white, black] = Math.random() > 0.5 ? [c1, c2] : [c2, c1]
            else if(sc1 == SideChoice.White || sc2 == SideChoice.Black)
                [white, black] = [c1, c2]
            else
                [white, black] = [c2, c1]

            this.side.white.connection = white
            this.side.black.connection = black

            info("Both players have chosen their sides - moving on to setup")
            this.set_state(State.PieceSetup)

            let white_msg = {state: this.state(), side : Player.White, code: this.side.white.id}
            let black_msg = {state: this.state(), side : Player.Black, code: this.side.black.id}

            this.send(white, Msg.StateUpdate, white_msg)
            this.send(black, Msg.StateUpdate, black_msg)
        }
    }

    handle_piece_setup(conn : connection, message : Message & any)
    {
        if(this.state() != State.PieceSetup)
        {
            warning("Received piece setup message when not in piece setup state")
            return
        }
        let setup : BoardSetup = BoardSetup.from_json(message.data)
        // TODO: Add validation

        if(this.side.white.connection == conn)
        {
            this.piece_setups.white = setup
            this.send(Player.Black, Msg.PieceSetup, {setup : message.data})
        }
        else if(this.side.black.connection == conn)
            this.piece_setups.black = setup

        if(this.piece_setups.white && this.piece_setups.black)
        {
            info("Both piece setups have been received")

            this.gs.board.setup(this.piece_setups.white)
            this.gs.board.setup(this.piece_setups.black)

            this.gs.white_setup = this.piece_setups.white
            this.gs.black_setup = this.piece_setups.black

            this.set_state(State.WhitesTurn)

            info("Sending black player's setup to white player")
            this.send(Player.White, Msg.PieceSetup, {setup : this.gs.black_setup.to_json()})

            info("Beginning the game - notifying clients")
            this.send(Player.White, Msg.StateUpdate, {state: State.WhitesTurn, black_setup : this.piece_setups.black.to_json()})
            this.send(Player.Black, Msg.StateUpdate, {state: State.WhitesTurn})
        }
    }

    handle_move_set(conn : connection, message : Message & any)
    {
        let s = this.state()
        if(s < State.WhitesTurn || s > State.BlacksTurn)
        {
            warning("Received move set when game is not ongoing")
            return
        }
        let sd = this.side
        let valid_conn = s == State.WhitesTurn ? sd.white.connection : sd.black.connection
        if(conn != valid_conn)
        {
            warning("Received move set from player whose turn it is not!")
            return
        }

        let ms_json : any[] = message.data
        let ms : Move[] = ms_json.map(m => Move.from_json(m))

        if(this.valid(ms))
        {
            info("Received valid move set, updating state")
            this.gs.apply(ms)
            if(this.gs.state >= State.WhiteWins)
            {
                info("<< Winning move has been made! >>")
            }
            this.send(conn, Msg.StateUpdate, {state: this.gs.state})
            let other : connection = s == State.WhitesTurn ? sd.black!.connection! : sd.white!.connection!
            this.send(other, Msg.StateUpdate, {state: this.gs.state, move_set: ms_json})
        }
        else
        {
            warning("Received an invalid move set!")
            this.send(conn, Msg.Error, {message : "Invalid move set"})
        }
    }

    handle_message(conn : connection, message : Message & any) : void
    {
        try
        {
            switch (message.type) {
                case Msg.StateRequest:
                    if (this.state() > State.SidePick) {
                        let s = this.side
                        let code : string = message.code ? message.code : "-1"
                        if(code != "-1")
                            info(`Code received along with state request: ${code}`)
                        if (!s.black.connection && s.black.id == code)
                            s.black.connection = conn
                        else if (!s.white.connection && s.white.id == code)
                            s.white.connection = conn
                        else
                            throw "Received state request without valid (and unoccupied) side code"
                    }
                    if(this.state() == State.PreGame && this.conns.length > 1)
                    {
                        this.gs.state = State.SidePick
                        for(let c of this.conns)
                            this.send_state(c)
                    }
                    else
                        this.send_state(conn)
                    break
                case Msg.SideChoice:
                    let choice = message.data
                    if(choice > SideChoice.DontCare || choice < SideChoice.White)
                        throw "Invalid side choice data"
                    this.handle_side_choice(conn, choice)
                    break;
                case Msg.PieceSetup:
                    this.handle_piece_setup(conn, message)
                    break
                case Msg.MoveSet:
                    this.handle_move_set(conn, message)
                    break
                default:
                    warning(`Received unhandleable message w type: ${Msg[message.type]}`)
            }
        } catch(e){
            error(`Error when handling message: ${e}`)
        }
    }

    /**
     * Handle sides etc
    */
    close_connection(conn : connection, code : number, desc : string)
    {
        // If the connection is already associated to a side, unset it
        if(this.side.white.connection == conn)
            this.side.white.connection = undefined
        else if(this.side.black.connection == conn)
            this.side.black.connection = undefined

        // Clear existing side choices
        for(let i = 0; i < this.side_choices.length; i++)
        {
            if(this.side_choices[i][0] == conn)
            {
                this.side_choices.splice(i,1)
                break;
            }
        }
    }
}

class Server
{
    http_server : any
    ws_server : server
    clients : connection[] = []

    // Consider extending this
    session : GameSession

    constructor(port : number)
    {
        this.http_server = http.createServer()
        this.http_server.listen(port)

        this.ws_server = new WebSocketServer({httpServer : this.http_server})

        this.message_handler = this.message_handler.bind(this)
        this.close_connection = this.close_connection.bind(this)
        this.request_handler = this.request_handler.bind(this)
        this.ws_server.on('request', this.request_handler)

        let gs = new GameState()
        gs.state = State.PreGame
        this.session = new GameSession(gs)
        info("{ Server started }")
    }

    message_handler(conn : connection)
    {
        let server = this
        return function(message : IMessage)
        {
            info(`<< Message received from ${conn.remoteAddress} >>`)
            // Verify and parse message
            if(message.type == "utf8" && typeof message.utf8Data == "string")
            {
                try {
                    let msg = JSON.parse(message.utf8Data)
                    //console.log(`Message - raw: ${message.utf8Data}, parsed: ${Object.keys(msg)}`)
                    if ("type" in msg)
                        server.session.handle_message(conn, msg)
                    else
                        throw "Received message without type parameter!"
                }
                catch(e)
                {
                    error(`Error when handling message: ${e}`)
                }
            }
        }
    }

    request_handler(request : request) : void
    {
        info(`== Incoming connection from ${request.remoteAddress} ==`)
        //log_circular(request);

        var conn = request.accept(undefined, request.origin)
        this.clients.push(conn)
        info(`Number of connections: ${this.clients.length}`)
        this.session.conns.push(conn)

        conn.on('message', this.message_handler(conn))
        conn.on("close", this.close_connection(conn))
    }

    close_connection(c : connection) : (c : number, desc : string) => void
    {
        let server = this
        return function(code : number, desc : string) : void
        {
            let i = server.clients.indexOf(c)
            if(i != -1)
            {
                info(`** Closing connection from ${c.remoteAddress} : (${code}, ${desc}) **`)
                server.session.close_connection(c, code, desc)
                server.clients.splice(i, 1)
            }
        }
    }
}

var s = new Server(3000)