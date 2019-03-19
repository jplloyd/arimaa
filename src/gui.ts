interface Message
{
    type : Msg
    data? : any
}

interface Serializeable
{
    to_json() : any
}

/**
 * Gui board piece wrapper for generating css classes
 */
class GuiBP
{
    bp : BoardPiece
    constructor(bp : BoardPiece)
    {
        this.bp = bp
    }

    css(mp : BoardPiece) : (string | {})[]
    {
        return [
            this.bp.alive ? 'button' : 'dead',
            this.p_class(),
            {marked : mp == this.bp},
        ]
    }

    p_class() : string
    {
        let p = this.bp.piece
        return `${p}${p.player == Player.Black ? '_' : ''}`
    }
}

class TurnState
{
    base_board : Board
    current_board : Board
    private move_buffer : Move[]

    constructor(base : Board)
    {
        this.base_board = base
        this.current_board = base.copy()
        this.move_buffer = []
    }

    /**
     * Immutable getter
     */
    moves() : Move[]
    {
        return this.move_buffer.slice(0)
    }

    /**
     * Add move to buffer, unless the resulting board state can be reduced
     * to a lesser number of moves, in which case a smaller set of moves are used
     * @param m Move to add
     */
    add_move(m : Move)
    {
        this.move_buffer.push(m)
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
    side_code : Maybe<string>
    // We don't know the state of the game until
    // the server has been contacted.
    gs : GameState
    ts : TurnState
    vm : any

    constructor()
    {
        this.gs = new GameState()
        this.gs.state = State.Disconnected

        this.ts = new TurnState(this.gs.board)
        //@ts-ignore
        gui_ob.data.pieces = this.ts.current_board.pieces.map(bp => new GuiBP(bp))
        //@ts-ignore
        gui_ob.data.gs = this.gs; gui_ob.data.ts = this.ts
        //@ts-ignore
        this.vm = new Vue(gui_ob)

        // Rebind the server listener functions, just in case
        this.error = this.error.bind(this)
        this.handle = this.handle.bind(this)
        this.open = this.open.bind(this)
        this.close = this.close.bind(this)
        this.handle_move_set = this.handle_move_set.bind(this)
    }

    /**
     * Try to connect to the server and set up the connection event listeners
     * Return true if the connection is made successfully, otherwise return false
     */
    connect() : boolean
    {
        try {
            this.gs.state = State.Connecting
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
            this.gs.state = State.Disconnected
            return false
        }
    }

    open(ev : Event)
    {
        //console.log("Connection opened, requesting state update")
        this.vm.connected = true
        this.request_state()
    }

    request_state()
    {
        let msg = {type : Msg.StateRequest, code: "-1"}
        if(window.location.hash.length > 1)
        {
            let code = window.location.hash.slice(1)
            msg.code = code
            //console.log(`Sending code: ${code}`)
        }
        this.send(msg)
    }

    send(s : any)
    {
        this.server.send(JSON.stringify(s))
    }

    error(ev : Event) : void
    {
        //console.log("An error handled in the client")
    }

    close(ev : Event) : void
    {
        //console.log("Connection is closing - better tell the user")
        this.vm.connected = false
        this.gs.state = State.Disconnected
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
                this.side_code = <string>data.code
                //console.log(`Setting side code: ${this.side_code}`)
                window.location.hash = this.side_code
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
                    let ms_js : [number, number][] = data.move_set
                    let ms : Move[] = ms_js.map(i => Move.from_json(i))
                    this.gs.apply(ms.slice())
                    this.handle_move_set(ms)
                    //this.ts.reset()
                    ////console.log("Definitely setting the client state here")
                    this.gs.state = data.state
                }
                break;
            default:
                //console.warn(`Unhandled update message for state: ${State[data.state]}!`)
                break;
        }
    }

    handle_move_set(ms: Move[]) : void
    {
        if(!this.vm.moving)
            this.vm.moving = true

        if(ms.length == 0)
        {
            ////console.log("No more moves")
            this.ts.reset()
            this.vm.moving = false
        }
        else
        {
            ////console.log("Moving")
            let c : Client = this
            let m = ms.shift()
            this.ts.current_board.apply_move(m!)
            window.setTimeout(function(){c.handle_move_set(ms)}, 600)
        }
    }

    init(data : any) : void // Handling State.SendState
    {
        //console.log("Initiating state")
        switch(data.state)
        {
            case State.PieceSetup:
                this.vm.player = data.side
                if(data.setup)
                {
                    // Set up the white pieces
                    //console.log("Setting up white's pieces (init)")
                    let ws : BoardSetup = BoardSetup.from_json(data.setup)
                    this.vm.gs.white_setup = ws
                    this.ts.current_board.setup(ws)
                    this.ts.base_board.setup(ws)
                }
                break
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
        ////console.log("Handling message")
        switch(msg.type) // For now, we trust the server completely
        {
            case Msg.StateSend:
                this.init(msg.data)
                break;
            case Msg.StateUpdate:
                this.update(msg.data)
                break;
            case Msg.SideChoice:
                //console.log(`We should play as ${Player[msg.data]}`)
                break
            case Msg.PieceSetup:
                //console.log(`Setting up white's pieces (update)`)
                let bs : BoardSetup = BoardSetup.from_json(msg.data.setup)
                this.gs.white_setup = bs
                this.ts.current_board.setup(bs)
                this.gs.board.setup(bs)
                break
            default:
                //console.warn(`Unhandled message: ${msg}`)
                break
        }
    }

    handle(ev: any) : void
    {
        //console.log(`Receiving message: ${ev.data}`)
        try {
        let data = JSON.parse(ev.data)
        if(!("type" in data))
            throw("Missing type parameter in message!")
        else
            this.msg_switch(data)
        } catch(error)
        {
            //console.error(`Error when handling message: ${error} Message: ${ev.data}`)
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
        markers: undefined,
        moving: false //Moves of the opponent are playing - prevent clicks
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
        disconnected: function(){return this.state == State.Disconnected},
        //@ts-ignore
        your_turn: function() {return this.turn == this.player && !this.moving},
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
        valid_turn: function(){return this.moves_made > 0 && this.moves_made < 5},
    },
    methods : {
        //Server related methods
        reconnect: function()
        {
            //@ts-ignore
            window.c.connect()
        },
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
            let gs : GameState = this.gs; let p : Player = this.player
            //@ts-ignore
            let setup = BoardSetup.from_board(this.player, b)
            c.send({type: Msg.PieceSetup, data: setup.to_json()})
            //@ts-ignore
            this.sent_setup = true; this.ts.apply(); this.ts.reset()
            if(p == Player.White)
                gs.white_setup = setup
            else
                gs.black_setup = setup
            gs.state = State.Waiting
            //@ts-ignore
            this.marked = undefined
        },
        end_turn : function()
        {
            //@ts-ignore
            let c : Client = window.c
            //@ts-ignore
            let ts : TurnState = this.ts
            c.gs.apply(ts.moves())
            c.send({type: Msg.MoveSet, data: ts.moves().map(m => m.to_json())})
            ts.reset()
        },
        // Piece setup and playing methods
        piece_cb: function(bp : BoardPiece)
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
                ////console.log("Clicking on a piece")
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
                ////console.log("Part one of the push/pull saga")
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
                ts.add_move(m)
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
                ////console.log("Stepping away!")
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
                ts.add_move(m)
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
        //History
        history: function()
        {
            //@ts-ignore
            return this.gs.history()
        },
        // Utility methods
        gen_log: function(data : any){
            //console.log(`Generic log: ${data}`)
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
        case State.Disconnected:
            return '<b>Disconnected</b>'
        case State.Connecting:
            return "Connecting..."
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