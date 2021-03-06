/* Alternative implementation of arimaa */

/* ------------- Basics --------------- */

enum Player {White, Black}
enum Rank {Rabbit, Cat, Dog, Horse, Camel, Elephant}
enum Dir {North, East, South, West}

enum SideChoice {White, Black, DontCare}

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

type Pos = number

function c(p : Pos) : {x : number, y : number}
{
    return {x : p & 7, y : p >> 3}
}

function i(x : number, y : number)
{
    return y << 3 | x
}

function p(p : Pos) : string
{
    return "hgfedcba"[p&7] + String((p>>3)+1)
}

function adj(p : Pos): Pos[] {
    let u : any = undefined
    let r: Maybe<number>[] = [
        p%8 > 0 ? p - 1 : u,
        p%8 < 7 ? p + 1 : u,
        p > 7 ? p - 8 : u,
        p < 56 ? p + 8 : u
    ]
    return <number[]>r.filter(n=>n != u)
}

function step(p : Pos, d : Dir) : Pos
{
    return p + [8,-1,-8,1][d];
}

/* Direction towards the second point relative to the first point 
   Assumes that the positions are adjacent
*/
function to_dir(a : Pos, b : Pos) : Dir
{
    return [3,2,0,1][((b-a)+9)%5] // [n:0,e:1,s:2,w:3] = [2,3,1,0]
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
let ph_pos = 0
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
        return `${this.piece}${p(this.pos)}`
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
        return this.piece.to_json() << 7 | this.pos << 1 | Number(this.alive)
    }

    static from_json(n : number) : BoardPiece
    {
        return new BoardPiece(Piece.from_json(n >> 7), n>>1 & 63, Boolean(n&1))
    }

    clone(bp : BoardPiece) : void
    {
        this.piece.clone(bp.piece)
        this.pos = bp.pos
        this.alive = bp.alive
    }

    stronger(bp : BoardPiece) : boolean
    {
        return this.piece.stronger(bp.piece)
    }

    equals(bp : BoardPiece)
    {
            return bp &&
            this.alive == bp.alive &&
            this.pos == bp.pos &&
            this.piece.equals(bp.piece)
    }
}

// ------------------------------------------------- //

// Trap positions for compact representations 
const traps : number[] = [18, 21, 42, 45]

// Index from indices of adjacent squares to their respective traps
const trap_adj: number[] = []
for (let t of traps) {
    for (let a of adj(t)) {
        trap_adj[a] = t
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
        return this.occupied ? ` ${this.piece}${p(this.pos)}x` : ''
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
            return (this.piece.to_json() << 2 | traps.indexOf(this.pos)) << 1 | 1
    }

    static from_json(n : number) : Trapped
    {
        if(n == 0)
            return clr_trps
        n >>= 1
        return new Trapped(traps[n & 3], Piece.from_json(n >> 2))
    }

    equals(t : Trapped) : boolean
    {
        if(t)
        {
            if(this.occupied == false && t.occupied == false)
                return true
            else
                return this.occupied == t.occupied && this.piece.equals(t.piece) && this.pos == t.pos
        }
        return false
    }
}

const clr_trps = new Trapped(ph_pos,ph_pc)
clr_trps.occupied = false

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

    to_pos() : Pos
    {
        return step(this.from,this.to)
    }

    is_inverse(m : Step | PushPull) : boolean
    {
        if(!this.trapped.occupied && m instanceof Step)
        {
            let st1 : Step = this
            let st2 : Step = m
            return true &&
                !st2.trapped.occupied &&
                st2.from == st1.to_pos() &&
                st1.from == st2.to_pos() &&
                st1.piece.equals(st2.piece)
        }
        return false
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
        {
            return false
        }

        let to_p = this.to_pos()
        let pred = (
            this.piece.player == turn &&
            this.piece.equals(board.piece(this.from)) &&
            board.free(to_p) && (moved || !board.frozen(this.from))
        )

        if(traps.indexOf(to_p) != -1)
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
        let bp = <BoardPiece>board.get(this.from)
        let to_p = this.to_pos()
        board.set(to_p, bp)
        board.set(this.from, undefined)
        bp.pos = to_p
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
        let rs = new Step(this.piece, this.to_pos(), invert(this.to), clr_trps)
        rs.apply(board)
    }

    toString(pp? : Maybe<boolean>) : string
    {
        let str = `${this.piece}${p(this.from)}${dirs[this.to]}${this.trapped}`
        if(pp)
            return str
        else
            return `[ ${str} ]`
    }

    descr() : string
    {
        return `${this.piece} moves from ${p(this.from)} to the ${Dir[this.to]}${this.trapped.descr()}`
    }

    to_json() : number
    {
        let n = this.piece.to_json() << 6 | this.from
        return (n << 2 | this.to) << 7 | this.trapped.to_json()
    }

    static from_json(n : number) : Step
    {
        let t = Trapped.from_json(n & 127)
        let p = n >> 9 & 63
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
        this.from = from
        this.to = to
        this.dest = dest
        this.trapped = trapped

        this.step1 = new Step(this.to_piece, this.to_pos(), this.dest, this.trapped[0])
        this.step2 = new Step(this.from_piece, this.from, this.to, this.trapped[1])
    }

    to_pos() : Pos
    {
        return step(this.from, this.to)
    }

    dest_pos() : Pos
    {
        return step(this.to_pos(), this.dest)
    }

    non_violent() : boolean
    {
        return !this.trapped.some(t => t.occupied)
    }

    is_inverse(m : Step | PushPull)
    {
        if(m instanceof PushPull && this.non_violent() && m.non_violent())
        {
            let pp1 = this
            let pp2 = m
            return pp1.step1.is_inverse(pp2.step2) && pp1.step2.is_inverse(pp2.step1)
        }

        return false;
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

        function err(msg : string)
        {
            console.log(`Pushpull validation error: ${msg}`)
        }


        if(fp.player == tp.player || fp.rank == tp.rank)
        {
            err("Trying to pull a piece on same side, or of equal rank")
            return false
        }

        let stronger = fp.stronger(tp) ? fp : tp

        if(stronger.player != turn)
        {
            err("The stronger piece does not belong to the side whose turn it is")
            return false
        }
        let st1 = this.step1.valid(board, tp.player, stronger == fp)
        if(!st1)
        {
            err("Error when validating step 1")
            return false
        }
        let st2 = this.step2.valid(this.step1.apply(board.copy()), fp.player, stronger == tp)
        if(!st2)
        {
            err("Error when validating step 2")
            return false
        }
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
        return `< ${this.step1.toString(true)} ${this.step2.toString(true)} >`
    }

    descr() : string
    {
        let to : Pos = this.to_pos()
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
        n = (n << 6 | this.from) << 4 | this.to << 2 | this.dest
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
        let from = n >>> 4 & 63
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

    to_json() : [number, number]
    {
        let s = this.move.to_json()
        if(this.move instanceof Step)
            return [0, s]
        else
            return [1, s]
    }

    static from_json([id, n] : [number, number]) : Move
    {
        if(id == 0)
            return new Move(Step.from_json(n))
        else
            return new Move(PushPull.from_json(n))
    }

    toString() : string
    {
        return this.move.toString()
    }

    is_inverse(m : Move) : boolean
    {
        return this.move.is_inverse(m.move)
    }
}
type StepInfo = {type : 'step', to : Pos, trapped : Trapped}
type PPInfo = {type : 'pushpull', to : Pos, trapped : Trapped, dest : [Pos,Trapped][]}
type MoveInfo = StepInfo | PPInfo

class BoardSetup
{
    player : Player
    pieces : [number, Pos, Rank][] = []

    constructor(player : Player, pieces : [number, Pos, Rank][])
    {
        this.player = player
        this.pieces = pieces
    }

    copy() : BoardSetup
    {
        return BoardSetup.from_json(this.to_json())
    }

    static from_board(player : Player, board : Board) : BoardSetup
    {   
        let pc : [number, Pos, Rank][] = []
        for (let bp of board.pieces)
        {
            if(bp.piece.player == player)
                pc.push([board.pieces.indexOf(bp), bp.pos, bp.piece.rank])
        }
        return new BoardSetup(player, pc)
    }

    toString() : string
    {
        let str = ''
        let pc = new Piece(this.player, 0)
        for(let [_, P, r] of this.pieces)
        {
            pc.rank = r
            str += `${pc}${p(P)} `
        }
        return str.slice(0, -1)
    }

    to_json() : any[]
    {
        let pcs = this.pieces.map(([i, p, r]) => [i, p, r])
        return [this.player, pcs]
    }

    static from_json(l : any[]) : BoardSetup
    {
        let f = function(pars : any[]) : [number, Pos, Rank]
        {
            return [pars[0], pars[1], pars[2]]
        }
        let pc : [number, Pos, Rank][] = l[1].map(f)
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
        this.pieces = pieces
        this.board = []
        this.recalc_board()
        this.dead_white = dead_white
        this.dead_black = dead_black
    }

    recalc_board()
    {
        this.board = []
        this.board.length = 64

        for (let p of this.pieces)
        {
            if (p.alive)
            {
                this.board[p.pos] = p
            }
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
                pieces[n] = BoardPiece.basic(new Piece(p, r), i)
                i += o
                n++
            }
        }
        return new Board(pieces, [] ,[])
    }

    setup(b : BoardSetup)
    {
        for(let [i, p, _] of b.pieces)
        {
            let bp = this.pieces[i]
            bp.pos = p
            bp.alive = true
            this.set(p, bp) // No need to recalculate board
        }
    }

    /**
     * Return the piece at the given square, or undefined
     * if the position is unoccupied
     * @param p The position of the square to retrieve
     */
    piece(i : Pos) : Maybe<Piece>
    {
        let s = this.board[i]
        if(s)
            return s.piece
        else
            return s
    }

    get(p : Pos) : Maybe<BoardPiece>
    {
        return this.board[p]
    }

    /**
     * Assign piece to (or unset) a square
     * @param p Position of square to assign to
     * @param s Square value to set
     */
    set(p : Pos, s : Maybe<BoardPiece>) : void
    {
        this.board[p] = s
    }

    /**
     * Return true if the square with the given position is empty, false otherwise
     * @param p The position to check
     */
    free(p : Pos) : boolean
    {
        return this.board[p] == undefined
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
            s = this.get(p)
        if(s)
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

    rabbits(p : Player) : BoardPiece[]
    {
        return this.pieces.filter(bp => bp.alive && bp.piece.rank == Rank.Rabbit && bp.piece.player == p)
    }

    // Pieces that can be moved by the given player
    moveables(p : Player) : BoardPiece[]
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
        for(let p of adj(bp.pos))
        {
            let np = this.get(p)
            if(np == undefined)
            {
                if(own_piece)
                {
                    // Rabbits cannot step backwards
                    if(bp.piece.rank != Rank.Rabbit || to_dir(bp.pos, p) != 2 - turn*2)
                    {
                        let trapped = this.deadly_trap(p, turn)
                        if(trapped == clr_trps)
                            trapped = this.sole_guardian(bp.pos)
                        res.push({type: 'step', to : p, trapped: trapped})
                    }
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
                {
                    let opp = opponent(turn)
                    let trapped = this.deadly_trap(p, own_piece ? turn : opp)
                    if(trapped == clr_trps)
                        trapped = this.sole_guardian(bp.pos)
                    let dest_traps : [Pos, Trapped][] = []
                    for(let dest_pos of empties)
                    {
                        let trapped = this.deadly_trap(dest_pos, own_piece ? opp : turn)
                        if (trapped == clr_trps)
                            trapped = this.sole_guardian(p)
                        dest_traps.push([dest_pos, trapped])
                    }
                    res.push({type: 'pushpull', to: p, trapped: trapped, dest : dest_traps})
                }
            }
        }
        return res
    }

    winner() : [Player] | false
    {
        for(let p of [Player.White, Player.Black])
        {
            let w : (n : number) => boolean = 
            [(n : number)=>n > 55,(n : number) => n < 8][p]

            let rs = this.rabbits(p)
            if(rs.length == 0)
                return [opponent(p)]
            for(let r of this.rabbits(p))
            {
                if(w(r.pos))
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
        for(let a of adj(p))
        {
            let s = this.piece(a)
            if(s)
            {
                res.push([a, s])
            }
        }
        return res
    }

    free_squares(p : Pos) : Pos[]
    {
        let res = []
        for(let ap of adj(p))
            if(this.piece(ap) == undefined)
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
        if(traps.indexOf(p) != -1)
        {
            let a = this.allies(p, pl)
            if(a.length == 1)
                return new Trapped(p, a[0][1])
        }
        return clr_trps
    }

    /**
     * If the position is adjacent to a trap with an allied piece in it and is the sole
     * allied neighbour to that trap, that position and piece is returned as a Trapped object.
     * Otherwise, the nothing-trapped constant is returned.
     * @param p The position of the prospective sole guardian.
     */
    sole_guardian(p : Pos) : Trapped
    {
        let g = this.piece(p)
        let t = trap_adj[p]
        if(t && g)
        {
            let s = this.piece(t)
            if(s && s.player == g.player)
                if(this.allies(t, g.player).length == 1)
                    return new Trapped(t, s)
        }
        return clr_trps
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
        let tp = <BoardPiece>this.board[t.pos]
        tp.alive = false
        this.dead(t.piece.player).push(this.pieces.indexOf(tp))
        this.set(t.pos, undefined)
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

    // ACHTUNG: Potential performance hog
    copy() : Board
    {
        return Board.from_json(this.to_json())
    }

    clone(b : Board)
    {
        for(let i = 0; i < b.pieces.length; i++)
        {
            this.pieces[i].clone(b.pieces[i])
        }
        this.recalc_board()
        list_replace(this.dead_black, b.dead_black)
        list_replace(this.dead_white, b.dead_white)
    }

    equals(b : Board) : boolean
    {
        if (b)
        {
            for(let i = 0; i < 64; i++)
            {
                let s1 = <BoardPiece>this.board[i]
                let s2 = <BoardPiece>b.board[i]
                let u = undefined
                if(xor(s1 == u, s2 == u) || s1 != s2 && !(s1).equals(s2))
                     return false
            }
            return true
        }
        return false
    }

    hash() : number
    {
        let res = 0
        let p_factors = [71,67,83]
        let i = 0
        for(let s of this.board)
        {
            if(s)
            {
                res += p_factors[i] * s.pos * s.piece.to_json()
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

enum State {
    Disconnected,
    Connecting,
    PreGame,
    Waiting,
    SidePick,
    PieceSetup,
    // Send entire game state upon request
    WhitesTurn,
    BlacksTurn,
    WhiteWins,
    BlackWins
}

// Initial setup, move history, latest board.
// Status or state
class GameState
{
    black_setup : BoardSetup | false
    white_setup : BoardSetup | false
    move_history : Move[][]
    board : Board
    state : State
    winner : Maybe<Player>

    constructor()
    {
        this.board = Board.default_board()
        this.move_history = []
        this.state = State.PreGame
        this.winner = undefined
        this.black_setup = false
        this.white_setup = false
    }

    clone(gs : GameState) : void
    {
        console.warn("Potentially unsafe clone operation (move history in game state)")
        this.white_setup = gs.white_setup ? gs.white_setup.copy() : false
        this.black_setup = gs.black_setup ? gs.black_setup.copy() : false
        list_replace(this.move_history, gs.move_history.map(l => l.map(m => Move.from_json(m.to_json()))))
        this.board.clone(gs.board)
        this.state = gs.state
        this.winner = gs.winner
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
        if(w !== false)
        {
            this.state = w[0] == Player.White ? State.WhiteWins : State.BlackWins
            this.winner = w[0]
        }
        else
        {
            this.state = this.state == State.WhitesTurn ? State.BlacksTurn : State.WhitesTurn
        }
    }

    static from_json(l : any[]) : GameState
    {
        let gs = new GameState()
        gs.state = l[0]
        gs.board = Board.from_json(l[1])
        let mh : any[][] = l[2]
        gs.move_history = mh.map(l => l.map(m => Move.from_json(m)))
        let ws = l[3]
        let bs = l[4]
        gs.white_setup = ws != 0 ? BoardSetup.from_json(ws) : false
        gs.black_setup = bs != 0 ? BoardSetup.from_json(bs) : false
        let w = l[5]
        gs.winner = w == 0 ? undefined : w-1
        return gs
    }

    to_json() : any[]
    {
        return [
            this.state,
            this.board.to_json(),
            this.move_history.map(l => l.map(m => m.to_json())),
            this.white_setup ? this.white_setup.to_json() : 0,
            this.black_setup ? this.black_setup.to_json() : 0,
            this.winner == undefined ? 0 : this.winner+1
        ]
    }
}

enum MoveError{
    EmptySet,
    ExcessMoves,
    WrongState,
    SameBoard,
    Reoccurence,
    InvalidMove
}

enum Msg {
    // Messages sent from client
    StateRequest,
    SideChoice,
    PieceSetup,
    MoveSet,
    // Messages sent from server
    StateSend,
    StateUpdate,
    InvalidMove,
    Marker,
    Error,
    HardReset
}