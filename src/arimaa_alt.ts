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
        return new Pos(n % 8, (n - n % 8) / 8)
    }

    toString() : string
    {
        return "hgfedcba"[this.x] + String(this.y+1)
    }

    index() : number
    {
        return this.y*8 + this.x
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
        return res;
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
        return this.x == p.x && this.y == p.y
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
}

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
const traps = [18, 21, 42, 45]

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
    constructor(p : Pos, pc : Piece)
    {
        this.pos = p
        this.piece = pc
    }

    toString() : string
    {
        return `${this.piece}${this.pos}x`
    }

    descr() : string
    {
        return `${this.piece.descr()} gets trapped at ${this.pos}`
    }

    to_json() : number
    {
        return (this.piece.to_json() << 2 | traps.indexOf(this.pos.index())) << 1 | 1
    }

    static from_json(n : number) : MTrapped
    {
        if(n == 0)
            return null
        n >>= 1
        return new Trapped(Pos.from_index(traps[n & 3]), Piece.from_json(n >> 2))
    }
}

// ------------------------------------------------- //

type MTrapped = Trapped | null

/* Simple step */
class Step
{
    piece : Piece
    from : Pos
    to : Dir
    trapped : MTrapped
    readonly cost : number = 1

	constructor(piece : Piece, from : Pos, to : Dir, trapped : MTrapped) {
        this.piece = piece
        this.from = from
        this.to = to
        this.trapped = trapped
	}
    
    toString() : string
    {
        let str = `${this.piece}${this.from}${dirs[this.to]}`
 
        if(this.trapped != null)
            str += ` ${this.trapped}`
        
        return str
    }

    descr() : string
    {
        let str = `${this.piece} moves from ${this.from} to the ${Dir[this.to]}`
        if(this.trapped != null)
            str += `${this.trapped.descr()}`
        return str;
    }

    to_json() : number
    {
        let n = this.piece.to_json() << 6 | this.from.index()
        n = (n << 2 | this.to) << 7

        if(this.trapped == null)
            n |= 0
        else
            n |= this.trapped.to_json()
        return n
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
    readonly trapped : [MTrapped, MTrapped] // [1st step, 2nd step]
    readonly cost : number = 2

    constructor(from_piece : Piece, to_piece : Piece, from : Pos, to : Dir, dest : Dir, trapped : [MTrapped, MTrapped])
    {
        this.from_piece = from_piece
        this.to_piece = to_piece
        this.from = from
        this.to = to
        this.dest = dest
        this.trapped = trapped
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
        if(t1 != null)
            desc += `. ${t1.descr()}`
        if(t2 != null)
            desc += `${t1 != null ? " and" : "."} ${t2.descr()}`
        return desc
    }

    to_json() : any[]
    {
        let trapped = this.trapped.map(x => x == null ? 0 : x.to_json())
        return [this.from_piece.to_json(), this.to_piece.to_json(), this.from.index(), this.to, this.dest, trapped[0], trapped[1]]
    }

    static from_json(l : any[]) : PushPull
    {
        let tt = l.slice(-2).map(x => x == 0 ? null : Trapped.from_json(x))
        return new PushPull(
            Piece.from_json(l[0]), 
            Piece.from_json(l[1]), 
            Pos.from_index(l[2]), 
            l[3], l[4], [tt[0], tt[1]])
    }

    compress() : number
    {
        return this.from.index() | this.to << 9 | this.dest << 6
    }

    static decompress(n : number)
    {
        return [Pos.from_index(n & 0b111111), n >> 9 & 3, n >> 6 & 3]
    }
}

type Move = Step | PushPull

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

// I think the premise is that we only create default boards via the constructor
class Board
{
    board : (Maybe<Piece>)[]
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
                this.board[p.pos.index()] = p.piece
        }
    }

    static default_board() : Board
    {
        let pieces = []
        pieces.length = 32
        let i = 0
        for(let p of [Player.White, Player.Black])
        {
            let index = [0, 63][p]
            let offs = [1, -1][p]

            for(let r of Board.ranknfile)
            {
                pieces[i] = BoardPiece.basic(new Piece(p, r), Pos.from_index(index))
                index += offs
                i++
            }
        }
        return new Board(pieces)
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

class GameState
{

}

function test(a : any)
{
    let j1 = a.to_json()
    let a2 = a.__proto__.constructor.from_json(j1)
    if(JSON.stringify(j1) == JSON.stringify(a2.to_json()))
        return true
    else
        return a.constructor.name + " " + a.toString() + " fails"
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

var bp0 = new BoardPiece(p0, new Pos(0,0), false)
var bp1 = new BoardPiece(p1, new Pos(3,4), true)
var bp2 = new BoardPiece(p2, new Pos(2,3), true)
var bp3 = new BoardPiece(p3, new Pos(7,7), true)
var bp4 = new BoardPiece(p0, new Pos(7,7), false)

var t1 = new Trapped(new Pos(2,5), p1)
var t2 = new Trapped(new Pos(5,5), p3)
var t3 = new Trapped(new Pos(2,2), p0)

var st1 = new Step(p1, new Pos(3,4), Dir.North, null)
var st2 = new Step(p2, new Pos(3,4), Dir.North, new Trapped(new Pos(2,2), p2))
var st3 = new Step(p1, new Pos(3,4), Dir.North, new Trapped(new Pos(5,5), p2))
var st4 = new Step(p0, new Pos(2,2), Dir.West, null)

var pp1 = new PushPull(p1, p2, new Pos(4, 5), Dir.North, Dir.South, [t1, null])
var pp2 = new PushPull(p3, p1, new Pos(2,5), Dir.West, Dir.West, [null, t2])
var pp3 = new PushPull(p3, p1, new Pos(6,5), Dir.West, Dir.West, [new Trapped(new Pos(2,2), p2), null])
var pp4 = new PushPull(p3, p1, new Pos(6,5), Dir.West, Dir.West, [null, new Trapped(new Pos(2,5), p3)])
var pp5 = new PushPull(p3, p1, new Pos(6,5), Dir.West, Dir.West, [new Trapped(new Pos(5,2), p1), new Trapped(new Pos(2,5), p3)])

let tests =
[
    p0, p1, p2, p3, 
    bp0, bp1, bp2, bp3, bp4,
    t1, t2, t3,
    st1, st2, st3, st4,
    pp1, pp2, pp3, pp4, pp5
]

function run_tests()
{
    for(let i of tests.map(test))
    {
        console.log(i)
    }
}