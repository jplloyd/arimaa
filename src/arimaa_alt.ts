/* Alternative implementation of arimaa */

/* ------------- Basics --------------- */

enum Player {White, Black}
enum Rank {Rabbit, Cat, Dog, Horse, Camel, Elephant}
enum Dir {North, East, South, West}

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
        this.pos = p
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
        this.from = from
        this.to = to
        this.trapped = trapped
	}

    /**
     * Return true if the move is valid for the given board and player turn
     * @param board The board to check the move against
     * @param turn The player for whom the turn is validated
     */
    valid(board : Board, turn : Player) : boolean
    {
        let to_p = this.from.step(this.to)
        let pred = (
            this.piece.player == turn &&
            this.piece.equals(board.get(this.from)) &&
            board.free(to_p) && !board.frozen(this.from)
        )
        if(traps.indexOf(to_p.index()) != -1)
            return pred && board.deadly_trap(to_p, this.piece.player).equals(this.trapped)
        else
            return pred && board.sole_guardian(this.from).equals(this.trapped)
    }

    apply(board : Board) : void
    {

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
    readonly trapped : [Trapped, Trapped] // [1st step, 2nd step]
    readonly cost : number = 2

    constructor(from_piece : Piece, to_piece : Piece, from : Pos, to : Dir, dest : Dir, trapped : [Trapped, Trapped])
    {
        this.from_piece = from_piece
        this.to_piece = to_piece
        this.from = from
        this.to = to
        this.dest = dest
        this.trapped = trapped
    }

    /**
     * Check if the move is legal for a given board and player's turn
     * @param board The board state to check against
     * @param turn The player for whose turn the move is validated
     */
    valid(board : Board, turn : Player) : boolean
    {
        let to_pos = this.from.step(this.to)
        let dest_pos = to_pos.step(this.dest)

        let p1 = this.from_piece.player != this.to_piece.player
        let p2 = this.from_piece.rank != this.to_piece.rank

        if(!(p1 && p2))
            return false

        let st1 = new Step(this.to_piece, to_pos, this.dest, this.trapped[0])
        let st2 = new Step(this.from_piece, this.from, this.to, this.trapped[1])

        if(this.to_piece.player != turn)
            [st1, st2] = [st2, st1]

        if(st1.valid(board, turn))
        {
            let tmp_to = board.get_bp(to_pos)
            board.set(to_pos, undefined)
            let result = st2.valid(board, (turn+1)%2)
            board.set(to_pos, tmp_to)
            return result
        }
        return false
    }

    toString() : string
    {
        // Some notes on the rules - the pushed or puller is moved first (indicated first)
        // When a unit dies in a trap in the first step, it is recorded immediately after the move that traps it
        let s1 = new Step(this.to_piece, this.from.step(this.to), this.dest, this.trapped[0])
        let s2 = new Step(this.from_piece, this.from, this.to, this.trapped[0])
        return `${s1} ${s2}`
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
    readonly pieces : BoardPiece[]

    static readonly ranknfile = [
        0,0,0,0,0,0,0,0,
        1,2,3,4,5,3,2,1,
    ]

    constructor(pieces : BoardPiece[])
    {
        this.board = []
        this.board.length = 64

        this.pieces = pieces
        for(let p of this.pieces)
        {
            if(p.alive)
                this.board[p.pos.index()] = p
        }
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
        return new Board(pieces)
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
    frozen(p : Pos) : boolean
    {
        let s = this.get(p)
        if(s != undefined)
        {
            if(this.allies(p, s.player).length > 0)
                return false
            for(let n of this.neighbours(p))
            {
                if(n[1].stronger(s))
                    return true
            }
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

    /**
     * Validate a move based on the current board and whose turn it is
     * @param m The move to validate
     * @param turn The player whose turn it is
     */
    valid_move(m : Move, turn : Player) : boolean
    {
        return m.move.valid(this, turn)
    }

    apply_move(m : Move)
    {

    }

    to_json() : any[]
    {
        return this.pieces.map((bp) => bp.to_json())
    }

    static from_json(l : any[]) : Board
    {
        let pieces = []
        for(let n of l)
        {
            pieces.push(BoardPiece.from_json(n))
        }
        return new Board(pieces)
    }

    clone(b : Board)
    {
        throw "NotImplemented"
    }
}

// Initial setup, move history, latest board.
// Status or state
class GameState
{

}

class TurnState
{

}


// Move this to a separate module - or a test module or something
function test(a : any)
{
    let j1 = a.to_json()
    let a2 = a.__proto__.constructor.from_json(j1)
    if(JSON.stringify(j1) == JSON.stringify(a2.to_json()))
        return true
    else
        return a.constructor.name + " Disparity: " + a.toString() + " != " + a2.toString()
}

function json_length(a : any)
{
    return JSON.stringify(a.to_json()).length
}

/*
    Test values
*/
var p0 = new Piece(Player.White, Rank.Rabbit)
var p1 = new Piece(Player.White, Rank.Dog)
var p2 = new Piece(Player.Black, Rank.Horse)
var p3 = new Piece(Player.Black, Rank.Elephant)
var p4 = new Piece(Player.Black, Rank.Camel)

var bp0 = new BoardPiece(p0, new Pos(0,0), false)
var bp1 = new BoardPiece(p1, new Pos(3,4), true)
var bp2 = new BoardPiece(p2, new Pos(2,3), true)
var bp3 = new BoardPiece(p3, new Pos(7,7), true)
var bp4 = new BoardPiece(p0, new Pos(7,7), false)

var t1 = new Trapped(new Pos(2,5), p1)
var t2 = new Trapped(new Pos(5,5), p3)
var t3 = new Trapped(new Pos(2,2), p0)

var st1 = new Step(p1, new Pos(3,4), Dir.North, nothing_trapped)
var st2 = new Step(p2, new Pos(3,4), Dir.North, new Trapped(new Pos(2,2), p2))
var st3 = new Step(p1, new Pos(3,4), Dir.North, new Trapped(new Pos(5,5), p2))
var st4 = new Step(p0, new Pos(2,2), Dir.West, nothing_trapped)
var st5 = new Step(p3, new Pos(6,5), Dir.West, new Trapped(new Pos(5,5), p4))

var pp1 = new PushPull(p1, p2, new Pos(4, 5), Dir.North, Dir.South, [t1, nothing_trapped])
var pp2 = new PushPull(p3, p1, new Pos(2,5), Dir.West, Dir.West, [nothing_trapped, t2])
var pp3 = new PushPull(p3, p1, new Pos(6,5), Dir.West, Dir.West, [new Trapped(new Pos(2,2), p2), nothing_trapped])
var pp4 = new PushPull(p3, p1, new Pos(6,5), Dir.West, Dir.West, [nothing_trapped, new Trapped(new Pos(2,5), p3)])
var pp5 = new PushPull(p3, p1, new Pos(6,5), Dir.West, Dir.West, [new Trapped(new Pos(5,2), p1), new Trapped(new Pos(2,5), p3)])

var m1 = new Move(st1)
var m2 = new Move(pp3)

var db = Board.default_board()

let tests =
[
    p0, p1, p2, p3, p4,
    bp0, bp1, bp2, bp3, bp4,
    t1, t2, t3,
    st1, st2, st3, st4, st5,
    pp1, pp2, pp3, pp4, pp5,
    db
]

function run_tests()
{
    for(let i of tests.map(test))
    {
        console.log(i)
    }
}

console.log("Running tests")
run_tests()