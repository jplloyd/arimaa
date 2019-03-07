const WebSocketServer = require('websocket').server;
const http = require('http');

const SERVER_PORT = 3000

class Server
{
    http_server : any
    ws_server : any
    clients : any[] = []

    constructor(port : number)
    {
        this.http_server = http.createServer()
        this.http_server.listen(port)

        this.ws_server = new WebSocketServer({httpServer : this.http_server})

        this.message_handler = this.message_handler.bind(this)
        this.close_connection = this.close_connection.bind(this)
        this.request_handler = this.request_handler.bind(this)
        this.ws_server.on('request', this.request_handler)
    }

    message_handler(message : any) : void
    {
        console.log(`Message received`)
    }

    request_handler(request : any) : void
    {
        console.log("Incoming connection")

        var conn = request.accept(null, request.origin)
        this.clients.push(conn)

        conn.on('message', this.message_handler)
        conn.on('close', function(c : any){console.log("Closing connection")})
    }

    close_connection(c : any)
    {
        let server = this
        return function()
        {
            let i = server.clients.indexOf(c)
            if(i != -1)
            {
                console.log(`Closing connection (${i})`)
                server.clients.splice(i, 1)
            }
        }
    }
}

var s = new Server(3000)

class GameSession
{
    gs : GameState
    ws : any

    // Any time a valid destructive move set is applied, clear the history
    board_history : {board : Board, turn : Player, occurences : number}[][] = []
    clients : any[] = []

    constructor(gs : GameState)
    {
        this.gs = gs
    }

    /**
     * Validate a sequence of moves against the current game state, guarantees
     * @param moveset Move set to validate against the current game state
     */
    valid(moveset : Move[]) : boolean
    {
        if(moveset.length == 0 || this.gs.state > State.BlacksTurn || this.gs.state < State.WhitesTurn)
            return false
        let turn : Player = this.gs.state == State.WhitesTurn ? Player.White : Player.Black
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