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
            case State.BlacksTurn:
            case State.WhiteWins:
            case State.BlackWins:
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
                    this.ts.reset()
                    console.log("Definitely setting the client state here")
                    this.gs.state = data.state
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
                this.ts.base_board = this.gs.board
                this.ts.reset()
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
                break
            default:
                console.warn(`Unhandled message: ${msg}`)
                break
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
        marked: undefined,
        markers: undefined
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
        moves_made: function(){return this.ts.moves_made()},
        //@ts-ignore
        valid_turn: function(){return this.moves_made > 0 && this.moves_made < 5}
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
            this.gs.state = State.Waiting; this.marked = undefined
        },
        end_turn : function()
        {
            //@ts-ignore
            let c : Client = window.c
            //@ts-ignore
            let ts : TurnState = this.ts
            c.gs.apply(ts.move_buffer)
            c.send({type: Msg.MoveSet, data: ts.move_buffer.map(m => m.to_json())})
            ts.reset()

        },
        // Piece setup and playing methods
        piece_blah: function(bp : BoardPiece)
        {
            let vm = this
            return bp.alive ? {click: () =>  vm.piece_click(bp)} : {}
        },
        piece_click: function(bp : BoardPiece){
            //@ts-ignore
            if(this.state == State.PieceSetup)
            {
                this.setup_piece(bp)
            }
            //@ts-ignore
            else if(this.your_turn)
            {
                console.log("Clicking on a piece")
                //@ts-ignore
                if(bp == this.marked)
                {
                    //@ts-ignore
                    this.marked = undefined; this.markers = undefined
                    return;
                }

                //@ts-ignore
                let ts : TurnState = this.ts; let player : Player = this.player
                let mi : MoveInfo[] = ts.current_board.moves(bp, player)

                if(mi.length != 0)
                {
                    //@ts-ignore
                    this.marked = bp
                    // What do we need from the markers - their position and a callback function
                    let markers = []
                    for(let minf of mi)
                    {
                        if(minf.type == "step")
                        {
                            let traps = minf.trapped != nothing_trapped
                            markers.push({
                                to: minf.to,
                                class: traps ? "death" : "clear",
                                trapped: minf.trapped,
                                cb: this.step(minf.trapped, minf.to)})
                        }
                        else
                        {
                            markers.push({
                                to: minf.to,
                                class: "pusher",
                                trapped: minf.trapped,
                                cb: this.pushpull_start(bp.pos.copy(), minf.to, minf.trapped, minf.dest)
                            })
                        }
                    }
                    //@ts-ignore
                    this.markers = markers
                }
                else
                {
                    //@ts-ignore
                    this.marked = undefined
                }
            }
        },
        pushpull_start: function(from : Pos, to : Pos, t : Trapped, dests : [Pos, Trapped][])
        {
            // When we click on one of these, we redefine the markers and create 
            // new callbacks to complete the pushpull move
            let vm = this
            //@ts-ignore
            let cb : Board = vm.ts.current_board
            let fromp : Piece = cb.get_bp(from)!.piece
            let to_p : Piece = cb.get_bp(to)!.piece
            let to_d : Dir = to_dir(from, to)
            return function(p : Pos)
            {
                console.log("Part one of the push/pull saga")
                let secondary_markers = []
                for(let [dest_p, tt] of dests)
                {
                    let dest_d : Dir = to_dir(to, dest_p)
                    secondary_markers.push({
                        to: dest_p,
                        class: "pusher",
                        trapped: tt,
                        cb: vm.pushpull_complete(fromp, to_p, from,to_d, dest_d, t, tt)
                    })
                }
                //@ts-ignore
                vm.markers = secondary_markers
            }
        },
        pushpull_complete: function(fromp : Piece, top : Piece, from : Pos, to : Dir, dest : Dir, t1 : Trapped, t2 : Trapped)
        {
            let vm = this
            return function(){
                let pp = new PushPull(fromp, top, from, to, dest, [t2, t1])
                let m = new Move(pp)
                //@ts-ignore
                let ts : TurnState = vm.ts
                ts.move_buffer.push(m)
                ts.current_board.apply_move(m)
                //@ts-ignore
                vm.markers = undefined; vm.marked = undefined
            }
        },
        step: function(t : Trapped, to : Pos)
        {
            let vm = this
            return function()
            {
                console.log("Stepping away!")
                //@ts-ignore
                let bp = vm.marked
                //@ts-ignore
                vm.marked = undefined
                //@ts-ignore
                let ts: TurnState = vm.ts
                let cb: Board = ts.current_board
                let dir = to_dir(bp.pos, to)
                let s = new Step(bp.piece, bp.pos, dir, t)
                let m = new Move(s)
                ts.move_buffer.push(m)
                cb.apply_move(m)
                //@ts-ignore
                vm.markers = undefined
            }
        },
        setup_piece: function(bp : BoardPiece)
        {
            //@ts-ignore
            if (bp == this.marked || bp.piece.player != this.player) {
                //@ts-ignore
                this.marked = undefined
            }
            //@ts-ignore
            else if (this.marked != undefined) // Shuffle time
            {
                let pos = bp.pos.copy()
                //@ts-ignore
                let m: BoardPiece = this.marked
                bp.pos.clone(m.pos)
                m.pos.clone(pos)
                //@ts-ignore
                this.marked = undefined
            }
            else // Marking time
            {
                //@ts-ignore
                this.marked = bp
            }
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