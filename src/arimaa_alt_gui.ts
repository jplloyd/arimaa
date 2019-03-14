interface Message
{
    type : Msg
    data? : any
}

interface Serializeable
{
    to_json() : any
}

class TurnState
{
    base_board : Board
    current_board : Board
    move_buffer : Move[]

    constructor(base : Board)
    {
        this.base_board = base
        this.current_board = base.copy()
        this.move_buffer = []
    }

    moves_made() : number
    {
        let res = 0
        for(let m of this.move_buffer)
        {
            res += m.move.cost
        }
        return res
    }

    apply() : void
    {
        this.base_board.clone(this.current_board)
        let mb = this.move_buffer
        mb.splice(0, mb.length)
    }

    reset() : void
    {
        this.current_board.clone(this.base_board)
        let mb = this.move_buffer
        mb.splice(0, mb.length)
    }

    undo() : void
    {
        let m = this.move_buffer.pop()
        if(m != undefined)
        {
            this.current_board.reverse_move(m)
        }
    }
}

/**
 * Handles connection to the server and interchange of messages with callbacks
 */
class Client
{
    //@ts-ignore
    server : WebSocket
    // We don't know the state of the game until
    // the server has been contacted.
    gs : GameState
    ts : TurnState
    vm : any

    constructor()
    {
        this.gs = new GameState()
        this.gs.state = State.Unknown

        this.ts = new TurnState(this.gs.board)
        //@ts-ignore
        gui_ob.data.pieces = this.ts.current_board.pieces
        //@ts-ignore
        gui_ob.data.gs = this.gs; gui_ob.data.ts = this.ts
        //@ts-ignore
        this.vm = new Vue(gui_ob)

        // Rebind the server listener functions, just in case
        this.error = this.error.bind(this)
        this.handle = this.handle.bind(this)
        this.open = this.open.bind(this)
        this.close = this.close.bind(this)
    }

    /**
     * Try to connect to the server and set up the connection event listeners
     * Return true if the connection is made successfully, otherwise return false
     */
    connect() : boolean
    {
        try {
            let ip = window.location.hostname
            //@ts-ignore
            this.server = new window.WebSocket(`ws://${ip}:3000`)
            this.server.onopen = this.open
            this.server.onerror = this.error
            this.server.onclose = this.close
            this.server.onmessage = this.handle
            return true
            
        } catch (error) {
            //@ts-ignore
            this.server = undefined
            return false
        }
    }

    open(ev : Event)
    {
        console.log("Connection opened, requesting state update")
        this.vm.connected = true
        this.request_state()
    }

    request_state()
    {
        this.send({type : Msg.StateRequest})
    }

    send(s : any)
    {
        this.server.send(JSON.stringify(s))
    }

    error(ev : Event) : void
    {
        console.log("An error handled in the client")
    }

    close(ev : Event) : void
    {
        console.log("Connection is closing - better tell the user")
        this.vm.connected = false
        this.gs.state = State.Unknown
    }

    initiate()
    {
        //this.vm = new Vue(this.vm_ob)
    }

    update(data : any) : void
    {
        this.gs.state = data.state

        switch(data.state)
        {
            case State.PieceSetup:
                this.vm.player = data.side
                break;
            case State.WhitesTurn:
                if(data.black_setup)
                {
                    let black_setup = BoardSetup.from_json(data.black_setup)
                    this.gs.black_setup = black_setup
                    this.gs.board.setup(black_setup)
                }
                if(data.move_set)
                {
                    let ms_js : number[] = data.move_set
                    let ms : Move[] = ms_js.map(i => Move.from_json(i))
                    this.gs.apply(ms)
                }
                break;
            default:
                console.warn(`Unhandled update message for state: ${State[data.state]}!`)
                break;
        }
    }

    init(data : any) : void // Handling State.SendState
    {
        console.log("Initiating state")
        switch(data.state)
        {
            case State.PieceSetup:
                this.vm.player = data.side
                if(data.setup)
                {
                    // Set up the white pieces
                    console.log("Setting up white's pieces")
                    let setup : BoardSetup = BoardSetup.from_json(data.setup)
                    this.ts.current_board.setup(setup)
                    this.ts.base_board.setup(setup)
                    this.gs.white_setup = setup
                }
                break;
            case State.WhitesTurn:
            case State.BlacksTurn:
            case State.WhiteWins:
            case State.BlackWins:
                // parse and clone the gamestate
                let new_gs = GameState.from_json(data.gamestate)
                this.vm.player = data.side
                this.gs.clone(new_gs)
                break;
            default:
                break;
        }

        this.gs.state = data.state
    }

    msg_switch(msg : Message)
    {
        console.log("Handling message")
        switch(msg.type) // For now, we trust the server completely
        {
            case Msg.StateSend:
                this.init(msg.data)
                break;
            case Msg.StateUpdate:
                this.update(msg.data)
                break;
            case Msg.SideChoice:
                console.log(`We should play as ${Player[msg.data]}`)
                break
            case Msg.PieceSetup:
                console.log(`Setting up white's pieces`)
                let bs : BoardSetup = BoardSetup.from_json(msg.data.setup)
                this.ts.current_board.setup(bs)
                this.gs.board.setup(bs)
                break;
            default:
                console.warn(`Unhandled message: ${msg}`)
                break;
        }
    }

    handle(ev: any) : void
    {
        console.log(`Receiving message: ${ev.data}`)
        try {
        let data = JSON.parse(ev.data)
        if(!("type" in data))
            throw("Missing type parameter in message!")
        else
            this.msg_switch(data)
        } catch(error)
        {
            console.error(`Error when handling message: ${error}
            Message: ${ev.data}`)
        }
    }
}

// Vue state object
let gui_ob =
{
    el : "#main",
    // Basic data objects
    data : {
        pieces : undefined,
        player : 0, // The side the client plays
        connected: false,
        greeting: "Hello, arimaa player",
        gs : undefined,
        ts : undefined,
        side_choice: -1,
        sent_setup: false,
    },
    // Computed methods
    computed : {
        //@ts-ignore
        turn : function(){return this.gs.state == State.WhitesTurn ? Player.White : this.gs.state == State.BlacksTurn ? Player.Black : -1},
        //@ts-ignore
        status : function() {return status_msg(this.gs.state)},
        //@ts-ignore
        state : function() {return this.gs.state},
        //@ts-ignore
        your_turn: function() {return this.turn == this.player},
        //@ts-ignore
        state: function() {return this.gs.state},
        //@ts-ignore
        show_board: function(){return this.gs.state >= State.PieceSetup || this.sent_setup},
        //@ts-ignore
        side_pick: function(){return this.gs.state == State.SidePick},
        //@ts-ignore
        piece_setup: function(){return this.gs.state == State.PieceSetup},
        //@ts-ignore
        moves_made: function(){return this.ts.moves_made()}
    },
    methods : {
        //Server related methods
        confirm_choice: function()
        {
            //@ts-ignore
            let c : Client = window.c
            //@ts-ignore
            c.send({type: Msg.SideChoice, data: this.side_choice})
            //@ts-ignore
            this.gs.state = State.Waiting
        },
        send_setup: function()
        {
            //@ts-ignore
            let c : Client = window.c
            //@ts-ignore
            let b = this.ts.current_board
            //@ts-ignore
            c.send({type: Msg.PieceSetup, data: BoardSetup.from_board(this.player, b).to_json()})
            //@ts-ignore
            this.sent_setup = true; this.ts.apply()
            //@ts-ignore
            this.gs.state = State.Waiting
        },
        // Utility methods
        gen_log: function(data : any){
            console.log(`Generic log: ${data}`)
        },
        pos: function (p: Pos) {
            return { top: this.offset(p.y), left: this.offset(p.x) }
        },
        board_letter: function (n: number) { return "ABCDEFGH"[n]; },
        offset: function (n: number) {
            let offs = 12.5 * n
            //@ts-ignore
            offs = this.player == 0 ? 87.5 - offs : offs
            return `${offs}%`
        },
        letter_pos: function (is_top: boolean, n: number) {
            let obj: any = new Object()
            obj.left = this.offset(7 - n)
            if (is_top)
                obj.top = '-8.1395%'
            else
                obj.bottom = '-8.1395%'
            return obj
        },
        number_pos: function (left_side: boolean, n: number) {
            let obj: any = { top: this.offset(n) };
            if (left_side) { obj.left = '-8.1395%' }
            else { obj.right = '-8.1395%' }
            return obj
        },
    }
}

function status_msg(s : State)
{
    switch(s)
    {
        case State.Unknown:
            return "Status unknown"
        case State.PreGame:
            return "Waiting for opponent to connect"
        case State.Waiting:
            return "Waiting for opponent"
        case State.SidePick:
            return "Pick your side"
        case State.PieceSetup:
            return "Set up your pieces"
        case State.WhitesTurn:
            return "White player's turn"
        case State.BlacksTurn:
            return "Black player's turn"
        case State.WhiteWins:
            return "White player wins!"
        case State.BlackWins:
            return "Black player wins!"
    }
}