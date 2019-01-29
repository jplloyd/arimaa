/* Some standard stuff that should be handled properly, but I cannot be arsed right now*/

interface Eq_<T>
{
    equals(t : T) : boolean
}

interface Copyable_<T>
{
    copy() : T
}

type Copyable<T> = T & Copyable_<T>

type Eq<T> = T & Eq_<T>

type Maybe<T> = T | null

function exists<T>(t : Eq<T>, l : T[]) : boolean {
    for(let i of l)
        if(t.equals(i))
            return true;
    return false;
}

function in_range(min : number, max : number, num : number)
{
    return num >= min && num <= max;
}

function eq<T>(i1 : Eq<T>, i2 : T) : boolean
{
    return i1.equals(i2)
}

function not<T>(f : (t : T) => boolean) : (t : T) => boolean
{
    return function(t) { return !f(t); }
}

function or<A>(f1 : (a : A) => boolean, f2 : (a : A) => boolean) : (a : A) => boolean
{
    return function(a) { return f1(a) || f2(a); }
}

function and<A>(f1 : (a : A) => boolean, f2 : (a : A) => boolean) : (a : A) => boolean
{
    return function(a) { return f1(a) && f2(a); }
}

function maybe<A, B>(b : B, f : (a : A) => B, p : A | null) : B
{
    if(p == null)
    {
        return b
    }
    else
    {
        return f(p);
    }
}

function fromMaybe<A>(a : A, aa : A | null) : A
{
    if(aa == null)
        return a;
    else
        return aa
}

function isNull(a : any) : boolean
{
    return a == null
}

/* End of the standard stuff - some of which will not be needed */

/**
 * Playing piece types in order of strength
 */
enum PieceType {
    Rabbit, Cat, Dog, Horse, Camel, Elephant
}

function stronger(p1: PieceType, p2: PieceType): boolean {
    return p1 > p2;
}

class Pos implements Eq<Pos>
{
    x : number;
    y : number;
    constructor(x : number, y : number)
    {
        this.x = x;
        this.y = y;
    }

    equals(p : Pos)
    {
        return p != null && this.x == p.x && this.y == p.y
    }

    static from_index(index: number): Pos {
        return new Pos(index % 8, (index - index % 8) / 8)
    }
    
    to_index(): number {
        return this.x + this.y * 8
    }

    toString(): string
    {
        return "ABCDEFGH"[7-this.x] + String(this.y+1)
    }
}

function adjacent(p: Pos): Pos[] {
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

function neighbours_i(board: Square[], p: Pos): [Pos, Piece][] {
    let result : [Pos, Piece][] = []
    for (let ap of adjacent(p)) {
        let s: Square = board[ap.to_index()]
        if (s != null) {
            result.push([ap, s])
        }
    }
    return result;
}

function neighbours(board: Square[], p: Pos): Piece[] {
    let result: Piece[] = []
    for (let ap of adjacent(p)) {
        let s: Square = board[ap.to_index()]
        if (s != null) {
            result.push(s)
        }
    }
    return result;
}

function is_trap(pos: Pos): boolean {
    return (pos.x == 2 || pos.x == 5) && (pos.y == 2 || pos.y == 5);
}

function is_adjacent(p1: Pos, p2: Pos) {
    let dx: number = p1.x - p2.x;
    let dy: number = p1.y - p2.y;
    return (dx * dx + 1) * (dy * dy + 1) == 2
}

// Every piece belongs to a player
enum Player { White, Black }

class Piece implements Eq<Piece>{
    player: Player;
    type: PieceType;
    constructor(
        player: Player,
        type: PieceType,
    ) {
        this.player = player;
        this.type = type;
    }

    copy() : Piece
    {
        return new Piece(this.player, this.type)
    }

    equals(p : Piece) : boolean
    {
        return p.player == this.player && p.type == this.type;
    }

    ally(p : Piece) : boolean
    {
        return this.player == p.player;
    }

    toString() : string
    {
        return ["White", "Black"][this.player] + " " + piece_type(this.type)
    }
}

function piece_type(p: PieceType): string {
    return ["rabbit", "cat", "dog", "horse", "camel", "elephant"][p]
}

function piece_class(p: Piece): string {
    return piece_type(p.type) + "_" + ["w", "b"][p.player]
}

class Step
{
    from : Pos;
    to : Pos;
    readonly cost : number = 1;

    constructor(from : Pos, to : Pos)
    {
        this.from = from
        this.to = to
    }

    equals(m : Move) : boolean{
        return m instanceof Step && m.from.equals(this.from) && m.to.equals(this.to);
    }

    invert() : Step
    {
        return new Step(this.to, this.from)
    }

    toString() : string
    {
        return this.from.toString() + " -> " + this.to.toString()
    }

    describe(board : Board) : string
    {
        let s_f : Square = board.get_s(this.from)
        if(s_f == null)
            return "invalid move"
        else
            return s_f.toString() + " moves from " + 
            this.from.toString() + " to " + this.to.toString()
    }
}

function desc() : string
{
    return ""
}

function rabbit_moves(player : Player, p : Pos) : Pos[]
{
    let f = function(pp : Pos) : boolean
    {
        if(player == Player.White)
            return pp.y >= p.y
        else
            return pp.y <= p.y
    }
    return adjacent(p).filter(f)
}

enum MoveType{ Step, Push, Pull}

function dests(board : Board, player : Player, p : Pos) : [Pos, MoveType][]
{
    let s : Square = board.get_s(p)
    if(s != null)
    {
        console.log("We should get here too")
        let mt : MoveType = s.player == player ? MoveType.Pull : MoveType.Push
        let f = function(p : Pos) : [Pos, MoveType] { return [p, mt]; }
        let res = adjacent(p).filter(board.free, board).map(f)
        console.log(res)
        return res
    }
    else
    {
        return [];
    }
}

function moves(board : Board, player : Player, p : Pos) : [Pos, MoveType][]
{
    let piece = board.get_s(p)
    if(piece != null)
    {
        if(piece.player == player && is_frozen(board.board, p))
        {
            return []
        }

        let result : [Pos, MoveType][] = []
        if(piece.type == PieceType.Rabbit && piece.player == player)
        { // Rabbits are unique in that they cannot step backwards
            for(let rp of rabbit_moves(player, p).filter(board.free, board))
            {
                result.push([rp, MoveType.Step]);
            }
            return result;
        }
        if(piece.player == player) // step or push
        {
            for(let ap of adjacent(p).filter(board.free, board))
            {
                result.push([ap, MoveType.Step])
            } // steps
                for(let [np, pc] of neighbours_i(board.board, p))
                {
                    if(pc.player != player && pc.type < piece.type)
                    {
                        if(adjacent(np).filter(board.free, board).length > 0)
                        {
                            result.push([np, MoveType.Push])
                        }
                    }
                }
        }
        else // only pulls (inverted push)
        {
            for(let [np, pc] of neighbours_i(board.board, p))
            {
                if(pc.player == player && pc.type > piece.type && !is_frozen(board.board, np))
                {
                    if(adjacent(np).filter(board.free, board).length > 0)
                    {
                        result.push([np, MoveType.Pull])
                    }
                }
            }
        }
        return result;
    }
    return [];
}

// NOTE - THIS FUNCTION IS INCORRECT
function moveable(board : Board, player : Player, p : Pos) : boolean
{
    let pred = function(pcs : Piece, pos : Pos)
    {
        let s : Square = board.get_s(pos)
        if(s)
        { 
            // Piece has to be: enemy that is either
            // 1) 
            return s.player != player
        }
        else // Can always move to an empty square
            return true;
    }

    let s = board.get_s(p)
    if(s && s.player == player)
    {
        if(s.type == PieceType.Rabbit)
            return rabbit_moves(player, p).filter(p => board.get_s(p) != null).length > 0
        else
            return adjacent(p).filter(p => board.get_s(p) == null).length > 0
    }
    return false;
}

// Pushes and pulls are both encoded as pushes, where pulls are inverted pushes with regards to player and piece strength.
// If the aggressor is stronger than the target, it is a push, otherwise it is a pull.
class PushPull
{
    from : Pos // pusher or pulled piece
    to : Pos // pushed piece or puller
    dest : Pos // destination of pushed piece or puller

    readonly cost : number = 2;

    constructor(from : Pos, to : Pos, dest : Pos) 
    {
        this.from = from
        this.to = to
        this.dest = dest
    }

    invert() : PushPull
    {
        return new PushPull(this.dest, this.to, this.from)
    }

    equals(m : Move) : boolean
    {
        return m instanceof PushPull && m.from == this.from && m.to == this.to && m.dest == this.dest;
    }

    toString()
    {
        return this.from.toString() + " -> " + this.to.toString() + " , " + this.to.toString() + " -> " + this.dest.toString()
    }

    // Parameterized toString equivalent
    describe(board : Board)
    {
        let s_f : Square = board.get_s(this.from)
        let s_t : Square = board.get_s(this.to)
        if(s_f == null || s_t == null)
        {
            return "Invalid move"
        }
        else
        {
            if(s_f.type > s_t.type)
            {
                return s_f.toString() + " at " + 
                    this.from.toString() + " pushes " + 
                    s_t.toString() + " from " + this.to.toString() + 
                    " to " + this.dest.toString()
            }
            else
            {
                return s_t.toString() + " at " + 
                    this.to.toString() + " moves to " + this.dest.toString() + 
                    " pulling " + s_f.toString() + " from " + this.dest.toString()

            }
        }
    }
}

type Move = Step | PushPull

function moves_to_json(mvs : Move[]) : string
{
    return JSON.stringify(mvs)
}

function setup_from_json(ob : any) : [Pos, Piece][]
{
    let result : [Pos, Piece][] = []
    for(let i of ob)
    {
        let pos : any = i[0]
        let p : any = i[1]
        result.push([new Pos(pos.x, pos.y), new Piece(p.player, p.type)])
    }
    return result;
}

function moves_from_json(s : string) : Move[]
{
    let result : Move[] = []
    let ls = JSON.parse(s)
    for(let o of ls)
    {
        let fromob = new Pos(o.from.x, o.from.y)
        let toob = new Pos(o.to.x, o.to.y)

        if(o.cost == 1)
            result.push(new Step(fromob, toob))
        else
            result.push(new PushPull(fromob, toob, new Pos(o.dest.x, o.dest.y)))
    }
    return result
}

function setup_to_json(pieces : [Pos, Piece][])
{
    let arr = []
    for(let [pos, p] of pieces)
    {
        arr.push(pos.to_index(), p)
    }
    return JSON.stringify(arr)
}

type Square = Piece | null

function empty(b: Board): (p: Pos) => boolean {
    return function (p: Pos) {
        return b.get_s(p) === null
    }
}

const traps : Pos[] = [new Pos(2, 2), new Pos(2, 5), new Pos(5, 2), new Pos(5, 5)]

function default_board(): Square[] {
    const piece_order: PieceType[] =
        [
            0,0,0,0,0,0,0,0,
            3,1,2,4,5,2,1,3,
        ]
    let board = []
    let i: number;

    for (i = 0; i < 64; i++) {
        board.push(null);
    }
    // Default piece placement
    for (let plr: Player = Player.White; plr <= Player.Black; plr++) {
        for (let n: number = 0; n < piece_order.length; n++) {
            let pos_index = n + (plr * (64 - 16));
            let p_index: number = (n + 8 * plr) % 16;
            let piece: Piece = new Piece(plr, piece_order[p_index]);
            board[pos_index] = piece
        }
    }
    return board;
}

function will_freeze(board: Square[], p: Piece, pos: Pos): boolean {
    let freezing = false;
    for (let neighbour of neighbours(board, pos)) {
        if (p == neighbour)
            continue
        if (neighbour.player == p.player)
            return false;
        if (neighbour.type > p.type)
            freezing = true;
    }
    return freezing;
}

function is_frozen(board: Square[], pos: Pos): boolean
{
    let s : Square = board[pos.to_index()]
    if(s == null)
        return false;
    else
    {
        let frozen = false;
        for(let p of neighbours(board, pos))
        {
            if(s.player == p.player)
                return false;
            if(p.type > s.type)
                frozen = true;
        }
        return frozen;
    }
}

/* True if the given position is a trap with no other neighbours of the same colour than the given piece */
function unguarded_trap(board : Square[], p : Piece, pos : Pos) : boolean {
    for(let p2 of neighbours(board, pos)) {
        if(p != p2 && p.player == p2.player)
            return false;
    }
    return is_trap(pos);
}

/* True if the position is a trap holding a piece with no adjacent allied pieces */
function trapped(board : Square[], pos : Pos) : boolean
{
    let s : Square = board[pos.to_index()]
    if(s != null)
    {
        let p : Player = s.player
        return is_trap(pos) && neighbours(board, pos).filter(np => np.player == p).length == 0;
    }
    return false;
}

/**If the given position is the sole guardian of an occupied trap */
function sole_guardian(board : Square[], pos : Pos) : Pos | null {
    let s = board[pos.to_index()]
    if(s == null)
        return null;
    else
    {
        let p : Piece = s;
        for(let t of traps)
        {
            let adj = adjacent(t)
            if(exists(pos, adj))
            {
                if(neighbours(board, pos).filter(p.ally, p).length == 1)
                    return t;
            }
        }
    }
    return null;
}

class Board {
    board: Square[];
    dead: Piece[];
    // Creates a default board layout
    constructor(board?: Square[], dead?: Piece[]) {
        if(board)
            this.board = board
        else
            this.board = default_board();
        if(dead)
            this.dead = dead
        else
            this.dead = []
    }

    static valid_pos(pos : Pos) : boolean
    {
        let i = pos.to_index();
        return i >= 0 && i <= 63;
    }

    swap(p : Pos, p2 : Pos)
    {
        let tmp = this.get_s(p)
        this.set_s(p, this.get_s(p2))
        this.set_s(p2, tmp)
    }

    setup(pieces : [Pos, Piece][])
    {
        for(let [pos, p] of pieces)
        {
            console.log("setting up: ", pos.toString(), p.toString())
            this.set_s(pos, p)
        }
    }

    free(pos : Pos) : boolean {
        return this.board[pos.to_index()] == null
    }

    free_squares(pos: Pos): Pos[] {
        let board_inst: Board = this;
        return adjacent(pos).filter(empty(this))
    }

    spring_traps() : [Pos, Piece][]
    {
        let trapped_pieces : [Pos, Piece][] = []
        for(let t of traps)
        {
            if(trapped(this.board, t))
            {
                let p : Piece = this.get_s(t)!;
                trapped_pieces.push([t, p])
                this.dead.push(p)
                this.set_s(t, null)
            }
        }
        return trapped_pieces;
    }

    pieces(p? : Player) : [Pos, Piece][]
    {
        let result : [Pos, Piece][] = []
        for(let i = 0; i < this.board.length; i++)
        {
            let s = this.board[i];
            if(s != null && (p == null || s.player == p ))
                result.push([Pos.from_index(i), s]);
        }
        return result;
    }

    get_s(pos: Pos): Square {
        return this.board[pos.to_index()];
    }

    set_s(pos : Pos, s : Square)
    {
        this.board[pos.to_index()] = s;
    }

    clone(b : Board)
    {
        this.dead.splice(0)
        this.board.splice(0)
        for(let d of b.dead)
            this.dead.push(d)
        for(let s of b.board)
            this.board.push(s)

    }

    copy() : Board
    {
        let dead : Piece[] = []
        for(let d of this.dead)
        {
            dead.push(d.copy())
        }
        let board : Square[] = []
        for(let s of this.board)
        {
            if (s == null)
                board.push(null)
            else
                board.push(s.copy())
        }
        return new Board(board, dead);
    }

    step(p1 : Pos, p2 : Pos)
    {
        this.set_s(p2, this.get_s(p1))
        this.set_s(p1, null)
    }

    // Not sure if this one is complete - but w.e. - we figure it out
    apply(m : Move) : [Pos, Piece][]
    {
        if(m instanceof PushPull) // Push or pull
        {
            this.set_s(m.dest, this.get_s(m.to));
            this.set_s(m.to, this.get_s(m.from));
            this.set_s(m.from, null);

            let ds : Square = this.get_s(m.dest);
            if(ds != null && trapped(this.board, m.dest))
            {
                this.dead.push(ds);
                this.set_s(m.dest, null);
            }
        }
        else
        { // Simple step
            this.set_s(m.to, this.get_s(m.from))
            this.set_s(m.from, null)
        }

        return this.spring_traps();
    }

    apply_set(m : Move[]) : void
    {
        for(let move of m)
        {
            this.apply(move);
        }
    }
}

function valid_setup(player : Player, pieces: [Pos, Piece][]) : boolean
{
    let range : [number, number];
    let covered : any[] = []
    if(pieces.length != 16)
        return false;
    if(player == Player.White)
        range = [0, 15]
    else
        range = [48, 63]
    for(let [pos, piece] of pieces)
    {
        let index = pos.to_index()
        if(index < range[0] || index > range[1])
            return false;
        if (covered[index] != undefined)
            return false;
        covered[index] = true
    }
    return true;
}

function valid_move_set(board : Board, turn : Player, moves : Move[]) : [boolean, number]
{
    let temp_board : Board = board.copy()
    let num_trapped : number = 0
    for(let m of moves)
    {
        if(valid_move(temp_board, turn, m))
            num_trapped += temp_board.apply(m).length
        else
            return [false, num_trapped];
    }
    return [true, num_trapped];
}

function valid_move(board : Board, turn : Player, m : Move) : boolean
{
    if(!(Board.valid_pos(m.from) && Board.valid_pos(m.to) && is_adjacent(m.from, m.to)))
        return false;
    let from_s : Square = board.get_s(m.from)
    if(from_s == null)
        return false;

    if(m instanceof PushPull)
    {
        if(!is_adjacent(m.to, m.dest))
            return false;
        let to_s : Square = board.get_s(m.to)
        if(to_s == null || to_s.player == from_s.player || !Board.valid_pos(m.dest))
            return false;
        if(from_s.player == turn)
        {  // it should be a push
            return from_s.type > to_s.type && !is_frozen(board.board, m.from)
        }
        else
        { // it should be a pull
            return from_s.type < to_s.type && !is_frozen(board.board, m.to)
        }
    }
    else
    {
        return board.free(m.to) && from_s.player == turn && !is_frozen(board.board, m.from)
    }
    return true;
}

function is_inverse(m1 : Move, m2 : Move) : boolean
{
    if(m1 instanceof Step)
    {
        if(m2 instanceof Step)
        {
            return m1.from == m2.to && m1.to == m2.from
        }
    }
    else
    {
        if(m2 instanceof PushPull)
        {
            1
            return m1.from == m2.dest &&
                m1.to == m2.to &&
                m1.dest == m2.from
        }
    }
    return false;
}

class TurnState 
{
    base_board : Board;
    turn_board : Board;

    // Moves performed, in order of oldest to newest
    // with each move is a list of pieces that were trapped as a result of the move
    // along with the position of the trap (at most two pieces can be trapped by one move)
    move_set : [Move, [Pos, Piece][]][];
    player : Player;

    constructor(base : Board, player : Player)
    {
        this.base_board = base;
        this.turn_board = base.copy()
        this.move_set = []
        this.player = player
    }

    apply() : void
    {
        this.base_board.clone(this.turn_board);
        this.move_set.splice(0)
    }

    moves() : number
    {
        let mv = 0
        for(let [m, _] of this.move_set)
        {
            mv += m.cost
        }
        return mv;
    }

    moveset() : Move[]
    {
        return this.move_set.map(a => a[0])
    }

    reset_turn() : void
    {
        this.turn_board.clone(this.base_board);
        this.move_set.splice(0)
    }

    undo() : void
    {
        if(this.move_set.length > 0)
        {
            let [m, pp] = this.move_set.pop()!
            if(pp.length != 0)
            {
                for(let [p, pc] of pp)
                    this.turn_board.set_s(p, pc)
            }
            this.turn_board.apply(m.invert())
        }
    }



    add_move(m : Move) : void
    {
        //Check if the move is a valid inversion of a previous move
        let mi : Move = m.invert()
        for(let i = this.move_set.length - 1; i >= 0; i--)
        {
            console.log("Checking all the moves")
            let [m2, pp] = this.move_set[i]
            console.log(mi.equals(m2))
            if(pp.length == 0 && mi.equals(m2))
            {
                console.log("This should pass")
                // Last move is always undoable
                if(i == this.move_set.length-1)
                {
                    this.undo()
                    return;
                }
                else
                {
                    // Potential inversion - check if subsequent moves are valid
                    let ms = this.move_set;
                    let _mvs = ms.slice(0,i).concat(ms.slice(i+1))
                    let mvs = _mvs.map(a => a[0])
                    let num_trapped = _mvs.map(a => a[1].length).reduce((a, b) => a + b)
                    //let mvs = moves_pre.concat(moves_post)
                    let [valid, num_trapped_post] = valid_move_set(this.base_board, this.player, mvs)
                    if(valid && num_trapped == num_trapped_post)
                    {
                        let b : Board = this.base_board.copy()
                        this.move_set.splice(0)
                        for(let m of mvs)
                        {
                            let mm = b.apply(m)
                            this.move_set.push([m, mm])
                        }
                        this.turn_board.clone(b)
                        return;
                    }
                    else
                        break;
                }
            }
        }
        // The move is not an inversion
        let mm = this.turn_board.apply(m)
        this.move_set.push([m, mm])
    }
}

class GameState {
    turn: number = 0;
    board: Board;
    history: Move[];

    constructor(init_board: Board) {
        this.board = init_board;
        this.history = [];
    }
}