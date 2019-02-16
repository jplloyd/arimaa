/* Alternative implementation of arimaa */

/* ------------- Basics --------------- */

enum Player {White, Black}
enum Rank {Rabbit, Cat, Dog, Horse, Camel, Elephant}
enum Dir {North, East, South, West}

/* ------------- Constants ------------ */

const dirs : string = "nesw"

/* ------------------------------------ */


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
    readonly rank : Rank
    readonly player : Player

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
        return this.player * 6 + this.rank
    }

    static from_json(n : number) : Piece
    {
        return new Piece(Math.ceil(n/6) - 1, n%6)
    }
}

/* Concrete piece - part of the game state */
class BoardPiece
{
    piece : Piece
    pos : Pos
    alive : boolean
    frozen : boolean

    constructor(p : Piece, pos : Pos, alive : boolean, frozen : boolean)
    {
        this.piece = p
        this.pos = pos
        this.alive = alive
        this.frozen = frozen
    }

    static basic(piece : Piece, pos : Pos)
    {
        return new BoardPiece(piece, pos, true, false)
    }

    toString() : string
    {
        return `${this.piece}${this.pos}`
    }

    descr() : string
    {
        if(this.alive)
            return `${this.piece.descr()} at ${this.pos}${this.frozen ? ' (frozen)' : ''}`
        else
            return `${this.piece.descr()} (captured)`
    }

    to_json() : any[]
    {
        return [this.piece.to_json(), this.pos.index(), Number(this.alive), Number(this.frozen)]
    }

    static from_json(l : any[]) : BoardPiece
    {
        return new BoardPiece(Piece.from_json(l[0]), Pos.from_index(l[1]), Boolean(l[2]), Boolean(l[3]))
    }
}

// ------------------------------------------------- //

let traps = [18, 21, 42, 45]

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

    static from_json(n : number) : Trapped
    {
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

    to_json() : any[]
    {
        let trapped : any
        if(this.trapped == null)
            trapped = 0
        else
            trapped = this.trapped.to_json()
        return [this.piece.to_json(), this.from.index(), this.to, trapped]
    }

    static from_json(l : any[]) : Step
    {
        let trapped = l[3]
        if(trapped == 0)
            trapped = null
        else
            trapped = Trapped.from_json(trapped)
        return new Step(Piece.from_json(l[0]), Pos.from_index(l[1]), l[2], trapped)
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
    trapped : [MTrapped, MTrapped] // [1st step, 2nd step]
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
        if(this.trapped[0] != null)
            desc += `. ${this.trapped[0].descr()}`
        if(this.trapped[1] != null)
            desc += `${this.trapped[0] != null ? " and" : "."} ${this.trapped[1].descr()}`
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

// I think the premise is that we only create default boards via the constructor
class Board
{
    board : Piece[]
    pieces : BoardPiece[]

    private readonly rank = [0,0,0,0,0,0,0,0]
    private readonly file = [1,2,3,4,5,3,2,1]

    constructor()
    {
        this.board = []
        this.board.length = 64

        this.pieces = []
        this.pieces.length = 32
    }

    to_json() : any[]
    {
        return this.pieces.map((bp) => bp.to_json())
    }

}

class GameState
{

}

function test(a : any) { return a.toString() == a.__proto__.constructor.from_json(a.to_json()).toString()}

/*
    Test values
*/
var p1 = new Piece(Player.White, Rank.Dog)
var p2 = new Piece(Player.Black, Rank.Horse)
var p3 = new Piece(Player.Black, Rank.Elephant)
var bp1 = new BoardPiece(p1, new Pos(3, 4), true, false)
var bp2 = new BoardPiece(p2, new Pos(2,3), true, true)

var st1 = new Step(p1, new Pos(3,4), Dir.North, null)
var st2 = new Step(p2, new Pos(3,4), Dir.North, new Trapped(new Pos(2,2), p2))
var st3 = new Step(p1, new Pos(3,4), Dir.North, new Trapped(new Pos(5,5), p2))

var pp1 = new PushPull(p1, p2, new Pos(4, 5), Dir.North, Dir.South, [null, null])
var pp2 = new PushPull(p3, p1, new Pos(2,5), Dir.West, Dir.West, [null, null])

var pp3 = new PushPull(p3, p1, new Pos(6,5), Dir.West, Dir.West, [new Trapped(new Pos(2,2), p2), null])
var pp4 = new PushPull(p3, p1, new Pos(6,5), Dir.West, Dir.West, [null, new Trapped(new Pos(2,5), p3)])
var pp5 = new PushPull(p3, p1, new Pos(6,5), Dir.West, Dir.West, [new Trapped(new Pos(5,2), p1), new Trapped(new Pos(2,5), p3)])