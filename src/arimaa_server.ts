import { request, connection, server, IMessage } from "websocket";

const WebSocketServer = require('websocket').server;
const http = require('http');

const SERVER_PORT = 3000

// TEMP - property printing
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


class Server
{
    http_server : any
    ws_server : server
    clients : connection[] = []

    // Consider extending this
    game_server : GameSession

    constructor(port : number)
    {
        this.http_server = http.createServer()
        this.http_server.listen(port)

        this.ws_server = new WebSocketServer({httpServer : this.http_server})

        this.message_handler = this.message_handler.bind(this)
        this.close_connection = this.close_connection.bind(this)
        this.request_handler = this.request_handler.bind(this)
        this.ws_server.on('request', this.request_handler)

        this.game_server = new GameSession(new GameState())
        console.log("{ Server started }")
    }

    message_handler(message : IMessage) : void
    {
        console.log(`<< Message received >>`)
        log_circular(message)
    }

    request_handler(request : request) : void
    {
        console.log("== Incoming connection ==")
        log_circular(request);

        var conn = request.accept(undefined, request.origin)
        this.clients.push(conn)

        conn.on('message', this.message_handler)
        //function(c : any){console.log("Closing connection")}
        conn.on('close', this.close_connection(conn))
    }

    close_connection(c : connection)
    {
        let server = this
        return function()
        {
            server.game_server

            let i = server.clients.indexOf(c)
            if(i != -1)
            {
                console.log(`** Closing connection (${i}) **`)
                server.clients.splice(i, 1)
            }
        }
    }
}

var s = new Server(3000)

type SideEntry = Maybe<{identifier : string, connection : connection}>

class GameSession
{
    gs : GameState
    side : {white : SideEntry, black : SideEntry}

    // Any time a valid destructive move set is applied, clear the history
    // A destructive move is one where one or more pieces are trapped
    board_history : {board : Board, turn : Player, occurences : number}[][] = []

    constructor(gs : GameState)
    {
        this.gs = gs
        this.side = {white : undefined, black : undefined}
    }

    state () : State
    {
        return this.gs.state
    }

    set_state(s : State)
    {
        this.gs.state = s
    }

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

    handle(msg : any) : void
    {

    }
}