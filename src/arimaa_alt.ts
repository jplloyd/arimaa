/* Alternative implementation of arimaa */

/* ------------- Basics --------------- */

enum Player {White, Black}
enum Rank {Rabbit, Cat, Dog, Horse, Camel, Elephant}
enum Dir {North, East, South, West}

function invert(d : Dir) : Dir
{
    return (d+2)%4
}

function opponent(p : Player) : Player
{
    return (p+1) % 2
}

function xor(a : boolean, b : boolean) : boolean
{
    return Boolean(Number(a) ^ Number(b))
}
/* ------------- Constants ------------ */

const dirs : string = "nesw"

/* ------------------------------------ */

type Maybe<T> = T | undefined

/* A position on the 8x8 board
coordinates going horizontally from SE to NW 
from white's perspective*/
class Pos
{
    x : number
    y : number
    constructor(x : number, y : number)
    {
        this.x = x
        this.y = y
    }

    static from_index(n : number) : Pos
    {
        return new Pos(n & 7, n >> 3)
    }

    toString() : string
    {
        return "hgfedcba"[this.x] + String(this.y+1)
    }

    index() : number
    {
        return this.y << 3 | this.x
    }

    adjacent() : Pos[] {
        const p = this
        let res: Pos[] = []
        if (p.x > 0)
            res.push(new Pos(p.x - 1,p.y))
        if (p.x < 7)
            res.push(new Pos(p.x + 1, p.y))
        if (p.y > 0)
            res.push(new Pos(p.x, p.y - 1))
        if (p.y < 7)
            res.push(new Pos(p.x, p.y + 1))
        return res
    }

    step(d : Dir) : Pos
    {
        switch(d)
        {
            case Dir.North:
                return new Pos(this.x, this.y+1)
            case Dir.South:
                return new Pos(this.x, this.y-1)
            case Dir.East:
                return new Pos(this.x-1, this.y)
            case Dir.West:
                return new Pos(this.x+1, this.y)
        }
    }

    equals(p : Pos) : boolean
    {
        return p != undefined && this.x == p.x && this.y == p.y
    }

    copy() : Pos
    {
        return new Pos(this.x, this.y)
    }

    clone(p : Pos) : void
    {
        this.x = p.x
        this.y = p.y
    }
}

/* Direction towards the second point relative to the first point 
   Assumes that the positions are adjacent
*/
function to_dir(p1 : Pos, p2 : Pos) : Dir
{
    if (p1.x == p2.x)
        return p1.y < p2.y ? 0 : 2
    else
        return p1.x > p2.x ? 1 : 3
}

/* Basic representation of a piece, independent of the board */
class Piece
{
    rank : Rank
    player : Player

    constructor(player : Player, rank : Rank)
    {
        this.rank = rank
        this.player = player
    }

    toString() : string
    {
        return "RCDHMErcdhme"[this.player*6 + this.rank]
    }

    stronger(p : Piece) : boolean
    {
        return this.rank > p.rank
    }

    descr() : string
    {
        return `${Player[this.player]} ${Rank[this.rank]}`
    }

    to_json() : number
    {
        return this.rank << 1 | (this.player & 1)
    }

    static from_json(n : number) : Piece
    {
        return new Piece(n & 1, n >> 1)
    }

    clone(p : Piece) : void
    {
        this.player = p.player
        this.rank = p.rank
    }

    equals(p : Piece | undefined) : boolean
    {
        if(p == undefined)
            return false
        else
            return this.player == p.player && this.rank == p.rank
    }
}

// Placeholders
let ph_pos = new Pos(0,0)
let ph_pc = new Piece(Player.White, Rank.Rabbit)

/* Concrete piece - part of the game state */
class BoardPiece
{
    // Basic properties
    piece : Piece
    pos : Pos
    alive : boolean

    // Calculated properties - recalculated after moves/move sets
    /* Reconsider inclusion of these - test performance and ease of use (interface)
    frozen : boolean = false
    sole_guardian : Maybe<Pos>
    free : Pos[] = []
    pushees : [Pos, Pos[]][] = [] // Adjacent weaker pieces with free spaces
    pullers : [Pos, Pos[]][] = [] // Adjacent stronger opponent with free spaces 
    */

    constructor(p : Piece, pos : Pos, alive : boolean)
    {
        this.piece = p
        this.pos = pos
        this.alive = alive
    }

    static basic(piece : Piece, pos : Pos)
    {
        return new BoardPiece(piece, pos, true)
    }

    toString() : string
    {
        return `${this.piece}${this.pos}`
    }

    descr() : string
    {
        if(this.alive)
            return `${this.piece.descr()} at ${this.pos}`
        else
            return `${this.piece.descr()} (captured)`
    }

    to_json() : any
    {
        return this.piece.to_json() << 7 | this.pos.index() << 1 | Number(this.alive)
    }

    static from_json(n : number) : BoardPiece
    {
        return new BoardPiece(Piece.from_json(n >> 7), Pos.from_index(n>>1 & 63), Boolean(n&1))
    }

    clone(bp : BoardPiece) : void
    {
        this.piece.clone(bp.piece)
        this.pos.clone(bp.pos)
        this.alive = bp.alive
    }

    stronger(bp : BoardPiece) : boolean
    {
        return this.piece.stronger(bp.piece)
    }

    equals(bp : BoardPiece)
    {
            return bp != undefined &&
            this.alive == bp.alive &&
            this.pos.equals(bp.pos) &&
            this.piece.equals(bp.piece)
    }
}

// ------------------------------------------------- //

// Trap positions for compact representations 
const traps : number[] = [18, 21, 42, 45]

// Index from indices of adjacent squares to their respective traps
const trap_adj: number[] = []
for (let t of traps) {
    for (let a of Pos.from_index(t).adjacent()) {
        trap_adj[a.index()] = t
    }
}

// (Pos, Piece) tuple indicating a trapped piece
class Trapped
{
    pos : Pos
    piece : Piece
    occupied : boolean

    constructor(p : Pos, pc : Piece)
    {
        this.pos = p.copy()
        this.piece = pc
        this.occupied = true
    }

    toString() : string
    {
        return this.occupied ? `${this.piece}${this.pos}x` : ''
    }

    descr() : string
    {
        return this.occupied ? `${this.piece.descr()} gets trapped at ${this.pos}` : ''
    }

    to_json() : number
    {
        if(!this.occupied)
            return 0
        else
            return (this.piece.to_json() << 2 | traps.indexOf(this.pos.index())) << 1 | 1
    }

    static from_json(n : number) : Trapped
    {
        if(n == 0)
            return nothing_trapped
        n >>= 1
        return new Trapped(Pos.from_index(traps[n & 3]), Piece.from_json(n >> 2))
    }

    equals(t : Trapped) : boolean
    {
        if(t != undefined)
        {
            if(this.occupied == false && t.occupied == false)
                return true
            else
                return this.occupied == t.occupied && this.piece.equals(t.piece) && this.pos.equals(t.pos)
        }
        return false
    }
}

const nothing_trapped = new Trapped(ph_pos,ph_pc)
nothing_trapped.occupied = false

// ------------------------------------------------- //


/* Simple step */
class Step
{
    piece : Piece
    from : Pos
    to : Dir
    trapped : Trapped
    readonly cost : number = 1

	constructor(piece : Piece, from : Pos, to : Dir, trapped : Trapped) {
        this.piece = piece
        this.from = from.copy()
        this.to = to
        this.trapped = trapped
	}

    /**
     * Return true if the move is valid for the given board and player turn
     * @param board The board to check the move against
     * @param turn The player for whom the turn is validated
     */
    valid(board : Board, turn : Player, moved : boolean = false) : boolean
    {
        // Special movement rules for rabbits (unless pulled/pushed)
        if(!moved && this.piece.rank == Rank.Rabbit && this.to == 2 - turn * 2)
            return false

        let to_p = this.from.step(this.to)
        let pred = (
            this.piece.player == turn &&
            this.piece.equals(board.get(this.from)) &&
            board.free(to_p) && (moved || !board.frozen(this.from))
        )

        if(traps.indexOf(to_p.index()) != -1)
            return pred && board.deadly_trap(to_p, this.piece.player).equals(this.trapped)
        else
            return pred && board.sole_guardian(this.from).equals(this.trapped)
    }

    /**
     * Apply the step to the board (without validation)
     * Move the piece and trap the trapped piece (may be the same)
     * @param board
     */
    apply(board : Board) : Board
    {
        let bp = <BoardPiece>board.get_bp(this.from)
        let to_p = this.from.step(this.to)
        board.set(to_p, bp)
        board.set(this.from, undefined)
        bp.pos.clone(to_p)
        if(this.trapped.occupied)
        {
            board.trap(this.trapped)
        }
        return board
    }

    revert(board : Board) : void
    {
        if(this.trapped.occupied)
            board.untrap(this.trapped)
        let rs = new Step(this.piece, this.from.step(this.to), invert(this.to), nothing_trapped)
        rs.apply(board)
    }

    toString() : string
    {
        let str = `${this.piece}${this.from}${dirs[this.to]}${this.trapped}`
        return str
    }

    descr() : string
    {
        return `${this.piece} moves from ${this.from} to the ${Dir[this.to]}${this.trapped.descr()}`
    }

    to_json() : number
    {
        let n = this.piece.to_json() << 6 | this.from.index()
        return (n << 2 | this.to) << 7 | this.trapped.to_json()
    }

    static from_json(n : number) : Step
    {
        let t = Trapped.from_json(n & 127)
        let p = Pos.from_index(n >> 9 & 63)
        return new Step(Piece.from_json(n >> 15), p, n >> 7 & 3, t)
    }
}

/* Push or pull
pulls are encoded as pushes by the weaker unit */
class PushPull
{
    from_piece : Piece
    to_piece : Piece
    from : Pos
    to : Dir
    dest : Dir
    //Calculated properties
    readonly step1 : Step
    readonly step2 : Step
    readonly trapped : [Trapped, Trapped] // [1st step, 2nd step]
    readonly cost : number = 2

    constructor(from_piece : Piece, to_piece : Piece, from : Pos, to : Dir, dest : Dir, trapped : [Trapped, Trapped])
    {
        this.from_piece = from_piece
        this.to_piece = to_piece
        this.from = from.copy()
        this.to = to
        this.dest = dest
        this.trapped = trapped

        this.step1 = new Step(this.to_piece, this.from.step(this.to), this.dest, this.trapped[0])
        this.step2 = new Step(this.from_piece, this.from.copy(), this.to, this.trapped[1])
    }

    /**
     * Check if the move is legal for a given board and player's turn
     * @param board The board state to check against
     * @param turn The player for whose turn the move is validated
     */
    valid(board : Board, turn : Player) : boolean
    {
        let fp = this.from_piece
        let tp = this.to_piece

        if(fp.player == tp.player || fp.rank == tp.rank)
        {
            return false
        }

        let stronger = fp.stronger(tp) ? fp : tp

        if(stronger.player != turn)
        {
            return false
        }
        let st1 = this.step1.valid(board, tp.player, stronger == fp)
        let st2 = this.step2.valid(this.step1.apply(board.copy()), fp.player, stronger == tp)
        return st1 && st2
    }

    apply(board : Board) : Board
    {
        this.step1.apply(board)
        this.step2.apply(board)
        return board
    }

    revert(board : Board) : void
    {
        this.step2.revert(board)
        this.step1.revert(board)
    }

    toString() : string
    {
        return `${this.step1} ${this.step2}`
    }

    descr() : string
    {
        let to = this.from.step(this.to)
        let desc : string
        if(this.from_piece.stronger(this.to_piece))
            desc = `${this.from_piece.descr()} at ${this.from} moves to the ${Dir[this.to]}, pushing ${this.to_piece.descr()} from ${to} to the ${Dir[this.dest]}`
        else
            desc = `${this.to_piece.descr()} at ${to} moves to the ${Dir[this.dest]}, pulling ${this.from_piece.descr()} from ${this.from}`
        let t1 = this.trapped[0]
        let t2 = this.trapped[1]
        if(t1.occupied)
            desc += `. ${t1.descr()}`
        if(t2.occupied)
            desc += `${t1.occupied ? " and" : "."} ${t2.descr()}`
        return desc
    }

    to_json() : number
    {
        let n = this.from_piece.to_json() << 4 | this.to_piece.to_json()
        n = (n << 6 | this.from.index()) << 4 | this.to << 2 | this.dest
        let [t1, t2] = this.trapped
        return n << 14 | t1.to_json() << 7 | t2.to_json()
    }

    static from_json(n : number) : PushPull
    {
        let tss = n & 16383
        let ts : [Trapped, Trapped]= [Trapped.from_json(tss >>> 7), Trapped.from_json(tss & 127)]
        n = n >>> 14
        let frp = Piece.from_json(n >>> 14 & 15)
        let top = Piece.from_json(n >>> 10 & 15)
        let from = Pos.from_index(n >>> 4 & 63)
        let pp = new PushPull(frp, top, from, n >>> 2 & 3, n & 3, ts)
        return pp
    }
}

class Move
{
    move: Step | PushPull

    constructor(move : Step | PushPull)
    {
        this.move = move
    }

    to_json() : number
    {
        let s = this.move.to_json()
        if(this.move instanceof Step)
            return s << 1 | 1
        else
            return s << 1
    }

    static from_json(n : number) : Move
    {
        if(n & 1)
            return new Move(Step.from_json(n >> 1))
        else
            return new Move(PushPull.from_json(n >> 1))
    }

    toString() : string
    {
        return this.move.toString()
    }
}
type StepInfo = {type : 'step', to : Pos}
type PPInfo = {type : 'pushpull', to : Pos, dest : Pos[]}
type MoveInfo = StepInfo | PPInfo

class BoardSetup
{
    player : Player
    pieces : [Pos, Rank][]

    constructor(p : Player, pieces : [Pos, Rank][])
    {
        this.player = p
        this.pieces = pieces
    }

    static from_board(player : Player, board : Board) : BoardSetup
    {   
        let pc : [Pos, Rank][] = []
        for (let bp of board.pieces)
        {
            pc.push([bp.pos, bp.piece.rank])
        }
        return new BoardSetup(player, pc)
    }

    toString() : string
    {
        let str = ''
        let pc = new Piece(this.player, 0)
        for(let [p, r] of this.pieces)
        {
            pc.rank = r
            str += `${pc}${p} `
        }
        return str.slice(0, -1)
    }

    to_json() : any[]
    {
        let pcs = this.pieces.map(([p, r]) => p.index() << 3 | r)
        return [this.player, pcs]
    }

    static from_json(l : any[]) : BoardSetup
    {
        let f = function(n : number) : [Pos, Rank]
        {
            return [Pos.from_index(n >> 3), n & 7]
        }
        let pc : [Pos, Rank][] = l.map(f)
        return new BoardSetup(l[0], pc)
    }
}

class Board
{
    board : Maybe<BoardPiece>[]
    dead_white : number[] = []
    dead_black : number[] = []
    pieces : BoardPiece[]

    static readonly ranknfile = [
        0,0,0,0,0,0,0,0,
        1,2,3,4,5,3,2,1,
    ]

    constructor(pieces : BoardPiece[], dead_white : number[], dead_black : number[])
    {
        this.board = []
        this.board.length = 64

        this.pieces = pieces
        for (let p of this.pieces)
        {
            if (p.alive)
            {
                this.board[p.pos.index()] = p
            }
        }
        this.dead_white = dead_white
        this.dead_black = dead_black
    }

    /**
     * Constructs a board with a basic setup of pieces - rabbits at the back
     * weakest to strongest placed mirrored from the edges to the center at the front
     */
    static default_board() : Board
    {
        let pieces = []
        pieces.length = 32
        let n = 0
        for(let p of [Player.White, Player.Black])
        {
            let i = [0, 63][p]
            let o = [1, -1][p]

            for(let r of Board.ranknfile)
            {
                pieces[n] = BoardPiece.basic(new Piece(p, r), Pos.from_index(i))
                i += o
                n++
            }
        }
        return new Board(pieces, [] ,[])
    }

    /**
     * Return the piece at the given square, or undefined
     * if the position is unoccupied
     * @param p The position of the square to retrieve
     */
    get(p : Pos) : Maybe<Piece>
    {
        return this.get_i(p.index())
    }

    get_i(i : number) : Maybe<Piece>
    {
        let s = this.board[i]
        if(s != undefined)
            return s.piece
        else
            return s
    }

    get_bp(p : Pos) : Maybe<BoardPiece>
    {
        return this.board[p.index()]
    }

    /**
     * Assign piece to (or unset) a square
     * @param p Position of square to assign to
     * @param s Square value to set
     */
    set(p : Pos, s : Maybe<BoardPiece>) : void
    {
        this.set_i(p.index(), s)
    }

    // Set using direct index
    set_i(i : number, s : Maybe<BoardPiece>) : void
    {
        this.board[i] = s
    }

    /**
     * Return true if the square with the given position is empty, false otherwise
     * @param p The position to check
     */
    free(p : Pos) : boolean
    {
        return this.get(p) == undefined
    }

    /**
     * Returns true if the given position is occupied by a piece that
     * cannot move due to being locked by an adjacent stronger opponent
     * piece, and lacks adjacent allied pieces.
     * @param p The position to check for a frozen piece
     */

    frozen(p : Pos | BoardPiece) : boolean
    {
        let s : Maybe<BoardPiece>
        if(p instanceof BoardPiece)
            s = p
        else
            s = this.get_bp(p)
        if(s != undefined)
        {
            if(this.allies(s.pos, s.piece.player).length > 0)
                return false
            for(let n of this.neighbours(s.pos))
            {
                if(n[1].stronger(s.piece))
                    return true
            }
        }
        return false
    }

    rabbits(p : Player)
    {
        return this.pieces.filter(bp => bp.alive && bp.piece.rank == Rank.Rabbit && bp.piece.player == p)
    }

    // Pieces that can be moved by the given player
    moveables(p : Player)
    {
        return this.pieces.filter(bp =>
            bp.alive && bp.piece.player == p && this.moves(bp, p).length > 0
        )
    }

    moves(bp : BoardPiece, turn : Player) : MoveInfo[]
    {
        let own_piece = bp.piece.player == turn
        if(!bp.alive || (own_piece && this.frozen(bp)))
            return []

        let res : MoveInfo[] = []
        for(let p of bp.pos.adjacent())
        {
            let np = this.get_bp(p)
            if(np == undefined)
            {
                if(own_piece)
                {
                    // Rabbits cannot step backwards
                    if(bp.piece.rank != Rank.Rabbit || to_dir(bp.pos, p) != 2 - turn*2)
                        res.push({type: 'step', to : p})
                }
            }
            else if(np.piece.player == bp.piece.player)
            {
                // Cannot push/pull allied piece
            }
            else if(bp.stronger(np) && own_piece || np.stronger(bp) && !own_piece && !this.frozen(np))
            {
                let empties : Pos[] = this.free_squares(p)
                if(empties.length > 0)
                    res.push({type: 'pushpull', to: p, dest : empties})
            }
        }
        return res
    }

    winner() : [Player] | false
    {
        for(let p of [Player.White, Player.Black])
        {
            let win_y : number = [7,0][p]

            let rs = this.rabbits(p)
            if(rs.length == 0)
                return [opponent(p)]
            for(let r of this.rabbits(p))
            {
                if(r.pos.y == win_y)
                    return [p]
            }
            if(this.moveables(p).length == 0)
                return [opponent(p)]
        }
        return false
    }

    /**
     * Return (position, piece) pairs of occupied adjacent squares
     * @param p The position for which neighbouring pieces will be returned
     */
    neighbours(p : Pos) : [Pos, Piece][]
    {
        let res : [Pos, Piece][] = []
        for(let ap of p.adjacent())
        {
            let s = this.get(ap)
            if(s != undefined)
            {
                res.push([ap, s])
            }
        }
        return res
    }

    free_squares(p : Pos) : Pos[]
    {
        let res = []
        for(let ap of p.adjacent())
            if(this.get(ap) == undefined)
                res.push(ap)

        return res
    }

    /**
     * Return (position, piece) pairs of adjacent pieces belonging to the given player
     * @param p The position for which allied neighbouring pieces will be returned
     * @param t The player to whom the returned pieces belong
     */
    allies(p : Pos, t : Player) : [Pos, Piece][]
    {
        return this.neighbours(p).filter(x => x[1].player == t)
    }

    /**
     * Checks if the position is a trap that would be deadly for a piece belonging
     * to the given player, should it step into it. Returns the position and piece
     * wrapped in a Trapped object if that is the case, otherwise return a constant.
     * @param p Position of the potential deadly trap to check
     * @param pl The player for whom to check if the trap is deadly
     */
    deadly_trap(p : Pos, pl : Player) : Trapped
    {
        let i = p.index()
        if(traps.indexOf(i) != -1)
        {
            let a = this.allies(p, pl)
            if(a.length == 1)
                return new Trapped(p, a[0][1])
        }
        return nothing_trapped
    }

    /**
     * If the position is adjacent to a trap with an allied piece in it and is the sole
     * allied neighbour to that trap, that position and piece is returned as a Trapped object.
     * Otherwise, the nothing-trapped constant is returned.
     * @param p The position of the prospective sole guardian.
     */
    sole_guardian(p : Pos) : Trapped
    {
        let i = p.index()
        let g = this.get_i(i)
        let t = trap_adj[i]
        if(t != undefined && g != undefined)
        {
            let tp = Pos.from_index(t)
            let s = this.get_i(t)
            if(s != undefined && s.player == g.player)
                if(this.allies(tp, g.player).length == 1)
                    return new Trapped(tp, s)
        }
        return nothing_trapped
    }

    dead(p : Player) : number[]
    {
        return p == Player.White ? this.dead_white : this.dead_black
    }

    /**
     * Trap the piece at the position given by the input -
     * Piece is marked as dead, removed from board, and its
     * internal index is added to its dead piece-list
     * @param t
     */
    trap(t : Trapped) : void
    {
        let i = t.pos.index()
        let tp = <BoardPiece>this.board[i]
        tp.alive = false
        this.dead(t.piece.player).push(this.pieces.indexOf(tp))
        this.set_i(i, undefined)
    }

    /**
     * Revives a trapped piece to the board -
     * Piece is marked as living, added back to board,
     * index is removed from dead piece-list.
     *
     * THIS FUNCTION RELIES ON THE PIECES BEING REVIVED IN REVERSE
     * ORDER OF BEING TRAPPED/KILLED - CONSIDER REDESIGNING BACKEND
     * @param t
     */
    untrap(t : Trapped)
    {
        let i : number = <number>this.dead(t.piece.player).pop()
        let tp = this.pieces[i]
        tp.alive = true
        this.set(t.pos, tp)
    }

    /**
     * Validate a move based on the current board and whose turn it is
     * @param m The move to validate
     * @param turn The player whose turn it is
     */
    valid_move(m : Move, turn : Player) : boolean
    {
        return m.move.valid(this, turn)
    }

    apply_move(m : Move) : Board
    {
        return m.move.apply(this)
    }

    reverse_move(m : Move) : this
    {
        m.move.revert(this)
        return this
    }

    to_json() : any[]
    {
        return [
            this.pieces.map((bp) => bp.to_json()),
            this.dead_white.slice(0),
            this.dead_black.slice(0)
        ]
    }

    static from_json(l : any[]) : Board
    {
        let pieces = []
        let ps = l[0]
        for(let n of ps)
        {
            pieces.push(BoardPiece.from_json(n))
        }
        return new Board(pieces, l[1], l[2])
    }

    copy() : Board
    {
        return Board.from_json(this.to_json())
    }

    clone(b : Board)
    {
        for(let i = 0; i < b.pieces.length; i++)
        {
            this.pieces[i].clone(b.pieces[0])
        }
        list_replace(this.dead_black, b.dead_black)
        list_replace(this.dead_white, b.dead_white)
    }

    equals(b : Board) : boolean
    {
        if (b != undefined)
        {
            for(let i = 0; i < 64; i++)
            {
                let s1 = <BoardPiece>this.board[i]
                let s2 = <BoardPiece>b.board[i]
                let u = undefined
                if(xor(s1 == u, s2 == u) || s1 != s2 && !(s1).equals(s2))
                     return false
            }
        }
        return b != undefined
    }

    hash() : number
    {
        let res = 0
        let p_factors = [71,67,83]
        let i = 0
        for(let s of this.board)
        {
            if(s != undefined)
            {
                res += p_factors[i] * s.pos.index() * s.piece.to_json()
                i = (i+1) % p_factors.length
            }
        }
        return res
    }
}

// Replace a list with another of the same type, maintaining the reference
function list_replace<T>(a : T[], b : T[])
{
    a.splice(0, a.length, ...b)
}

// Game and server states

enum State {SidePick, PieceSetup, WhitesTurn, BlacksTurn, WhiteWins, BlackWins}

// Initial setup, move history, latest board.
// Status or state
class GameState
{
    move_history : Move[][]
    board : Board
    state : State

    constructor()
    {
        this.board = Board.default_board()
        this.move_history = []
        this.state = State.SidePick
    }

    // This should only be called after the validation has been run
    apply(ms : Move[]) : void
    {
        this.move_history.push(ms)
        for(let m of ms)
        {
            this.board.apply_move(m)
        }
        let w = this.board.winner()
        if(w != false)
        {
            this.state = w[0] == Player.White ? State.WhiteWins : State.BlackWins
        }
    }
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

}

// Vue state object
let gui_ob =
{
    el : "",
    // Basic data objects
    data : {
        gs : new GameState()
    },
    // Computed methods
    computed : {

    },
    methods : {}
}
