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
        this.vm = new Vue(gui_ob)

        // Rebind the server listener functions, just in case
        this.error = this.error.bind(this)
        this.handle = this.handle.bind(this)
        this.open = this.open.bind(this)
        this.close = this.close.bind(this)
    }

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
        switch(this.gs.state)
        {

        }
    }

    init(data : any) : void
    {
        console.log("Initiating state")
        switch(data.state)
        {
            case State.PieceSetup:
                if(data.setup)
                {
                    // Set up the white pieces
                    let setup : BoardSetup = BoardSetup.from_json(data.setup)
                    this.ts.current_board.setup(setup)
                    this.ts.base_board.setup(setup)
                }
                break;
            case State.WhitesTurn:
            case State.BlacksTurn:
            case State.WhiteWins:
            case State.BlackWins:
                break;
            default:
                break;
        }

        this.gs.state = data.state
        this.vm.state = data.state
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
            default:
                console.warn(`Unhandled message received: ${msg}`)
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
        turn : -1, // The side whose turn it is
        connected: false,
        greeting: "Hello, arimaa player",
        state : 0,
        history : []
    },
    // Computed methods
    computed : {
        //@ts-ignore
        status : function() {return status_msg(this.state)},
        //@ts-ignore
        your_turn: function() {return this.turn == this.player},

    },
    // Utility methods
    methods : {
        gen_log(data : any){
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