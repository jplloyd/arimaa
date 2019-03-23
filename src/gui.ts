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

    // For each move, a list of subsequent moves whose validity depend on this move
    dependents : [Move, Move[]][] = []
    // For each move, a list of preceding moves that determines its validity
    dependencies : [Move, Move[]][] = []

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
     * Add move to buffer, first checking if the move is a valid inversion
     * of an existing move, in which case that move is instead removed
     * @param m Move to add
     */
    add_move(m : Move, turn : Player)
    {
        this.current_board.apply_move(m)
        // Check if the move circles back to an unchanged board
        if(this.current_board.equals(this.base_board))
        {
            this.reset()
            return;
        }
        // Check if the new move is a valid inversion of a previous move
        for(let i = 0; i < this.dependents.length; i++)
        {
            let [m_, ds] = this.dependents[i]

            if(ds.length == 0 && m_.is_inverse(m))
            {
                // Remove inverted move from buffer and dependency lists
                let m_i = this.move_buffer.indexOf(m_)
                this.move_buffer.splice(m_i, 1)
                this.dependents.splice(i, 1)
                this.dependencies.splice(i, 1)
                // Update dependencies
                for(let [_, dss] of this.dependents)
                {
                    let _i = dss.indexOf(m_)
                    if(_i != -1)
                    {
                        dss.splice(_i, 1)
                    }
                }
                return;
            }
        }
        // Move was not a valid inversion, check which moves this move depends on.
        // If the move is valid for the base board, it is dependent on no other moves
        let m_deps : Move[] = []
        if(!this.base_board.valid_move(m, turn))
        {
            let cb = this.current_board.copy()
            cb.reverse_move(m) // We applied the move prior to the copy
            // List of moves that we cannot reverse
            let deps : Move[] = []
            for(let i = this.dependents.length-1; i >= 0; i--)
            {
                let [mm, dpts] = this.dependents[i]
                let [_, dpcs] = this.dependencies[i]
                if (deps.indexOf(mm) == -1)
                {
                    cb.reverse_move(mm)
                    if (!cb.valid_move(m, turn))
                    {
                        // Move m is directly dependent on preceding move mm
                        dpts.push(m)
                        m_deps.push(mm)
                        cb.apply_move(mm)
                        deps.splice(0, 0, ...dpcs)
                    }
                }
                else
                {
                    deps.splice(0,0,...dpcs)
                }
            }
        }
        this.dependencies.push([m, m_deps])
        this.dependents.push([m,[]])
        this.move_buffer.push(m)
    }

    print_deps() : string
    {
        let res=''
        for(let i = 0; i < this.move_buffer.length; i++)
        {
            let m = this.move_buffer[i]
            let [_, dps] = this.dependencies[i]
            let [__, dpn] = this.dependents[i]
            res += `(${m}) :: deps = [${dps}], :: dpnt = [${dpn}]<br/>`
        }
        return res
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
        this.move_buffer.splice(0)
        this.dependents.splice(0)
        this.dependencies.splice(0)
    }

    // fetch all dependent moves in order of valid reversal
    // clearing them from the buffers in the process
    get_dependents(m : Move) : Move[]
    {
        let queue : [Move, Move[]][] = [[m, [m]]] //deps
        let result : Move[] = []
        do {
            let [_, dependents] = <[Move, Move[]]>queue.pop()
            for(let d of dependents)
            {
                let j = this.move_buffer.indexOf(d)
                this.move_buffer.splice(j,1)
                this.dependencies.splice(j,1)
                queue.push(this.dependents.splice(j,1)[0])
                result.push(d)
            }
        } while (queue.length > 0);
        return result.reverse()
    }

    undo(m? : Move) : void
    {
        if(m != undefined)
        {
            let i = this.move_buffer.indexOf(m)
            if(i != -1)
            {
                let to_revert : Move[] = this.get_dependents(m)
                for(let rm of to_revert)
                {
                    this.current_board.reverse_move(rm)
                }
            }
        }
        else
        {
            m = this.move_buffer.pop()
            if(m != undefined)
            {
                this.dependents.pop()
                this.dependencies.pop()
                this.current_board.reverse_move(m)
            }
        }
        // Clear removed moves from dependents
        // TODO: do this immediately instead?
        for(let [mm, dpnd] of this.dependents)
        {
            for(let mmm of dpnd)
            {
                let j = this.move_buffer.indexOf(mmm)
                if(j == -1)
                {
                    dpnd.splice(j,1)
                    break
                }
            }
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
                    //console.log("Definitely setting the client state here")
                    this.gs.state = data.state
                }
                // No move set means the move set we sent was valid
                else if(this.ts.moves_made() != 0)
                {
                    this.gs.apply(this.ts.moves())
                    this.ts.reset()
                    this.vm.sending = false
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
            //console.log("No more moves")
            this.ts.reset()
            this.vm.moving = false
        }
        else
        {
            //console.log("Moving")
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
        //console.log("Handling message")
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
            case Msg.InvalidMove:
                let err = msg.data.message
                this.vm.error = error_msg(err)
                this.vm.sending=false
                break
            case Msg.Marker:
                if(!this.vm.your_turn)
                {
                    console.log("Handling marker update")
                    let i = msg.data
                    this.vm.marked = this.ts.current_board.get(i)
                }
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
            console.error(`Error when handling message: ${error} Message: ${ev.data}`)
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
        gs : undefined,
        ts : undefined,
        side_choice: -1,
        sent_setup: false,
        marked: undefined,
        markers: undefined,
        moving: false, //Moves of the opponent are playing - prevent clicks
        error: undefined,
        confirm: undefined,
        sending: false
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
        show_board: function(){return !this.disconnected && (this.gs.state >= State.PieceSetup || this.sent_setup)},
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
        send: function(t : Msg, d : any)
        {
            //@ts-ignore
            window.c.send({type : t, data : d})
        },
        //Server related methods
        reconnect: function()
        {
            //@ts-ignore
            window.c.connect()
        },
        confirm_choice: function()
        {
            //@ts-ignore
            this.send(Msg.SideChoice, this.side_choice)
            //@ts-ignore
            this.gs.state = State.Waiting
        },
        send_setup: function()
        {
            //@ts-ignore
            let b = this.ts.current_board
            //@ts-ignore
            let gs : GameState = this.gs; let p : Player = this.player
            //@ts-ignore
            let setup = BoardSetup.from_board(this.player, b)
            this.send(Msg.PieceSetup, setup.to_json())
            //@ts-ignore
            this.sent_setup = true; this.ts.apply(); this.ts.reset()
            if(p == Player.White)
                gs.white_setup = setup
            else
                gs.black_setup = setup
            gs.state = State.Waiting
            //@ts-ignore
            this.unmark()
        },
        end_turn: function (override : boolean) {
            //@ts-ignore
            if (!this.sending)
            {
                //@ts-ignore
                if (this.moves_made == 4 || override)
                {
                    //@ts-ignore
                    this.sending = true; this.confirm = undefined
                    //@ts-ignore
                    let ts: TurnState = this.ts;
                    this.unmark()
                    this.send(Msg.MoveSet, ts.moves().map(m => m.to_json()))
                }
                else
                {
                    //@ts-ignore
                    this.confirm=`You have only used ${this.moves_made} moves. End turn anyway?`
                }
            }
        },
        unmark()
        {
            //@ts-ignore
            this.marked = undefined; this.markers = undefined
            this.send(Msg.Marker, 64)
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
                //console.log("Clicking on a piece")
                //@ts-ignore
                if(bp == this.marked)
                {
                    this.unmark()
                    return;
                }

                //@ts-ignore
                let ts : TurnState = this.ts; let player : Player = this.player
                let mi : MoveInfo[] = ts.current_board.moves(bp, player)

                if(mi.length != 0)
                {
                    //@ts-ignore
                    this.marked = bp
                    this.send(Msg.Marker, bp.pos)
                    // What do we need from the markers - their position and a callback function
                    let markers = []
                    for(let minf of mi)
                    {
                        if(minf.type == "step")
                        {
                            let traps = minf.trapped != clr_trps
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
                                cb: this.pushpull_start(bp.pos, minf.to, minf.trapped, minf.dest)
                            })
                        }
                    }
                    //@ts-ignore
                    this.markers = markers
                }
                else
                {
                    this.unmark()
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
            let fromp : Piece = cb.get(from)!.piece
            let to_p : Piece = cb.get(to)!.piece
            let to_d : Dir = to_dir(from, to)
            return function(p : Pos)
            {
                //console.log("Part one of the push/pull saga")
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
                let ts : TurnState = vm.ts; let p : Player = vm.player
                ts.add_move(m, p)
                vm.unmark()
            }
        },
        step: function(t : Trapped, to : Pos)
        {
            let vm = this
            return function()
            {
                //console.log("Stepping away!")
                //@ts-ignore
                let bp = vm.marked
                vm.unmark()
                //@ts-ignore
                let ts: TurnState = vm.ts; let p : Player = vm.player
                let cb: Board = ts.current_board
                let dir = to_dir(bp.pos, to)
                let s = new Step(bp.piece, bp.pos, dir, t)
                let m = new Move(s)
                ts.add_move(m, p)
                vm.unmark()
            }
        },
        setup_piece: function(bp : BoardPiece)
        {
            //@ts-ignore
            if (bp == this.marked || bp.piece.player != this.player) {
                this.unmark()
            }
            //@ts-ignore
            else if (this.marked) // Shuffle time
            {
                let pos = bp.pos
                //@ts-ignore
                let m: BoardPiece = this.marked
                bp.pos = m.pos
                m.pos = pos
                this.unmark()
            }
            else // Marking time
            {
                //@ts-ignore
                this.marked = bp
            }
        },
        undo: function(m? : Move)
        {
            //@ts-ignore
            this.ts.undo(m)
            this.unmark()
        },
        reset: function()
        {
            //@ts-ignore
            this.ts.reset()
            this.unmark()
        },
        // Utility methods
        gen_log: function(data : any){
            //console.log(`Generic log: ${data}`)
        },
        pos: function (p: Pos) {
            //let p = c(pp)
            return { top: this.offset(p>>3), left: this.offset(p&7) }
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

function status_msg(s : State) : string
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

function error_msg(me : MoveError) : string
{
    switch(me)
    {
        case MoveError.EmptySet:
            return "Somehow you sent no moves, try again"
        case MoveError.ExcessMoves:
            return "Received more moves than allowed, try again"
        case MoveError.InvalidMove:
            return "You sent an invalid move, complain to the developer and try again"
        case MoveError.Reoccurence:
            return "The resulting board state has occured two times already, try again"
        case MoveError.SameBoard:
            return "The board has to change between each turn, try again"
        case MoveError.WrongState:
            return "The game is not ongoing, don't try again"
    }
}