// Basic consistency tests, unit tests, integration tests, written plain
// import {Msg, Maybe, GameState, Board, BoardSetup, State, Player, Move, Trapped} from "./arimaa_alt"
namespace Tests {

    let tests_passed = 0
    let tests_failed = 0

    // Move this to a separate module - or a test module or something
    function json_string_test(a: any) {
        let j1 = a.to_json()
        let a2 = a.__proto__.constructor.from_json(j1)
        if (JSON.stringify(j1) == JSON.stringify(a2.to_json()) && a.toString() == a2.toString())
        {
            tests_passed++
            return true
        }
        else
        {
            tests_failed++
            return a.constructor.name + " Disparity: " + a.toString() + " != " + a2.toString()
        }
    }

    function assert(test : boolean, msg : string)
    {
        if(test)
            tests_passed++
        else
            tests_failed++
        console.assert(test, msg)
    }

    export function json_length(a: any) {
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
    var p5 = new Piece(Player.White, Rank.Elephant)

    var bp0 = new BoardPiece(p0, new Pos(0, 0), false)
    var bp1 = new BoardPiece(p1, new Pos(3, 4), true)
    var bp2 = new BoardPiece(p2, new Pos(2, 3), true)
    var bp3 = new BoardPiece(p3, new Pos(7, 7), true)
    var bp4 = new BoardPiece(p0, new Pos(7, 7), false)

    var t1 = new Trapped(new Pos(2, 5), p1)
    var t2 = new Trapped(new Pos(5, 5), p3)
    var t3 = new Trapped(new Pos(2, 2), p0)

    var st0 = new Step(p5, new Pos(4, 1), Dir.North, nothing_trapped)
    var st1 = new Step(p1, new Pos(3, 4), Dir.North, nothing_trapped)
    var st2 = new Step(p2, new Pos(3, 4), Dir.North, new Trapped(new Pos(2, 2), p2))
    var st3 = new Step(p1, new Pos(3, 4), Dir.North, new Trapped(new Pos(5, 5), p2))
    var st4 = new Step(p0, new Pos(2, 2), Dir.West, nothing_trapped)
    var st5 = new Step(p3, new Pos(6, 5), Dir.West, new Trapped(new Pos(5, 5), p4))

    var nn : [Trapped, Trapped] = [nothing_trapped, nothing_trapped]

    var pp1 = new PushPull(p1, p2, new Pos(4, 5), Dir.North, Dir.South, [t1, nothing_trapped])
    var pp2 = new PushPull(p3, p1, new Pos(2, 5), Dir.West, Dir.West, [nothing_trapped, t2])
    var pp3 = new PushPull(p3, p1, new Pos(6, 5), Dir.West, Dir.West, [new Trapped(new Pos(2, 2), p2), nothing_trapped])
    var pp4 = new PushPull(p3, p1, new Pos(6, 5), Dir.West, Dir.West, [nothing_trapped, new Trapped(new Pos(2, 5), p3)])
    var pp5 = new PushPull(p3, p1, new Pos(6, 5), Dir.West, Dir.West, [new Trapped(new Pos(5, 2), p1), new Trapped(new Pos(2, 5), p3)])
    export var pp6 = new PushPull(p5, p4, new Pos(4, 6), Dir.South, Dir.South, nn)
    var pp7 = new PushPull(p4, p5, new Pos(4, 4), Dir.North, Dir.North, nn)


    var m1 = new Move(st1)
    var m2 = new Move(pp3)

    var db = Board.default_board()

    var gs = new GameState()

    var wh = new Piece(Player.White, Rank.Horse)
    var wc = new Piece(Player.White, Rank.Cat)

    let basics =
        [
            wh,
            p0, p1, p2, p3, p4,
            bp0, bp1, bp2, bp3, bp4,
            t1, t2, t3,
            st0, st1, st2, st3, st4, st5,
            pp1, pp2, pp3, pp4, pp5, pp6,
            m1, new Move(pp6), m2,
            db, gs
        ]

    function makeStep(bp : BoardPiece, dir : Dir, trapped : Trapped = nothing_trapped) : Move
    {
        return new Move(new Step(bp.piece, bp.pos, dir, trapped))
    }

    function move_val_apply(board : Board, m : Move, t : Player)
    {
        let test = board.valid_move(m, t)
        if(test)
        {
            board.apply_move(m)
            tests_passed++
        }
        else
        {
            tests_failed++
            console.error(`Move not valid: ${m}`)
        }
    }

    function board_tests() : void
    {
        assert(db.dead_white.length == db.dead_black.length && db.dead_white.length == 0, "No dead pieces in default board")
        let tb = db.copy() // tb = test board
        assert(tb.equals(db), "Copied board should equal its origin")

        let trap_horse = new Move(new Step(wh, new Pos(2, 1), Dir.North,
        new Trapped(new Pos(2,2), wh)))

        assert(tb.valid_move(trap_horse, Player.White), "White horse should be moveable and get trapped")
        tb.apply_move(trap_horse)
        assert(!tb.equals(db), "Copied board should not equal source after step is applied")
        assert(!tb.valid_move(trap_horse, Player.White), "Move should no longer be valid")
        let rabb1 = tb.pieces[0]
        assert(rabb1.piece.equals(new Piece(Player.White, Rank.Rabbit)), "First piece is white rabbit")
        assert(tb.moves(rabb1, Player.White).length == 0, "The white rabbit should be enclosed")
        let move_cat = new Move(new Step(wc, new Pos(0,1), Dir.North, nothing_trapped))
        assert(tb.valid_move(move_cat, Player.White),"White cat can be moved, no casualties")
        tb.apply_move(move_cat)
        assert(tb.moves(rabb1, Player.White).length == 1, "Rabbit can move north")

        tb.reverse_move(move_cat)
        tb.reverse_move(trap_horse)

        assert(tb.equals(db), "After move reversals, board should be back to original state")

        tb.apply_move(move_cat)
        let move_rabb = new Move(new Step(rabb1.piece, rabb1.pos, Dir.North, nothing_trapped))

        assert(tb.valid_move(move_rabb, Player.White), "White rabbit can move north now")

        tb.apply_move(move_rabb)

        assert(rabb1.pos.equals(new Pos(0,1)), "White rabbit position should be updated")

        let illegal_rabbit = new Move(new Step(rabb1.piece, rabb1.pos, Dir.South, nothing_trapped))

        assert(!tb.valid_move(illegal_rabbit, Player.White), "Rabbits cannot move backwards")

        let be = <BoardPiece>tb.get_bp(new Pos(3,6))
        assert(be != undefined, "There should be a black elephant at 3x6")

        // Note that this move is dynamic due to the shared position
        let e_move = new Move(new Step(be.piece, be.pos, Dir.South, nothing_trapped))

        assert(tb.valid_move(e_move, Player.Black), "Black elephant can roam south")
        tb.apply_move(e_move)
        let ms = makeStep(be, Dir.South)
        assert(tb.valid_move(ms, Player.Black), "Black elephant can still move south")
        assert(!tb.valid_move(ms, Player.White), "Black elephant cannot be moved by white player")
        tb.apply_move(makeStep(be, Dir.South))
        tb.apply_move(makeStep(be, Dir.South))
        tb.apply_move(makeStep(be, Dir.South)) // Black elephant is adjacent to white camel to the south
        assert(!tb.valid_move(e_move, Player.Black), "Black elephant cannot move south")

        let mw = makeStep(be, Dir.West)
        assert(tb.valid_move(mw, Player.Black), "Black elephant can move west")

        tb.apply_move(mw)

        let wm = <BoardPiece>tb.get_bp(new Pos(3, 1))
        assert(wm != undefined, "There is a white camel at 3x1")
        assert(!tb.frozen(wm), "Camel is not frozen")
        assert(!tb.frozen(wm.pos), "Camel is really not frozen")

        let M_move = new Move(new Step(wm.piece, wm.pos, Dir.North, nothing_trapped))
        assert(tb.valid_move(M_move, Player.White), "Camel can move north")
        assert(tb.deadly_trap(new Pos(2,2), Player.White) != nothing_trapped, "Trap at 2,2 is deadly atm")
        tb.apply_move(M_move)
        assert(tb.frozen(wm), "Camel is now frozen")
        assert(!tb.valid_move(M_move, Player.White), "Camel can no longer move north")
        assert(tb.deadly_trap(new Pos(2,2), Player.White).equals(nothing_trapped), "Trap at 2,2 is no longer deadly")

        assert(!tb.valid_move(trap_horse, Player.White), "Horse does not die")
        let safe_horse = new Move(new Step(wh, new Pos(2,1), Dir.North, nothing_trapped))
        assert(tb.valid_move(safe_horse, Player.White), "Horse is now safe to travel north")

        assert(tb.sole_guardian(wm.pos).equals(nothing_trapped), "Camel is not a sole guardian")

        tb.apply_move(safe_horse)

        assert(!tb.frozen(wm), "Camel is no longer frozen")
        assert(!tb.sole_guardian(wm.pos).equals(nothing_trapped), "Camel is the sole guardian")

        let br = new Piece(Player.Black, Rank.Rabbit)
        let legal_r = new Move(new Step(br, new Pos(3, 7), Dir.South, nothing_trapped))
        assert(tb.valid_move(legal_r, Player.Black), "Black rabbit can move south")
        tb.apply_move(legal_r)
        let dubious_r = new Move(new Step(br, new Pos(3, 6), Dir.South, nothing_trapped))
        assert(tb.valid_move(dubious_r, Player.Black), "Black rabbit can take another step")
        dubious_r.move.to = Dir.North
        assert(!tb.valid_move(dubious_r, Player.Black), "Black rabbit cannot move backwards")
        let moves = tb.moves(<BoardPiece>tb.get_bp(new Pos(3,6)), Player.Black)
        assert(moves.length == 1 && moves[0].type == "step" && moves[0].to.equals(new Pos(3,5)),
            "Black rabbit should only have 1 move: 1 step to the south")
        moves = tb.moves(be, Player.Black)
        assert(moves.length == 3, "Black elephant should be able to step (2) and push (1)")
        moves = tb.moves(wm, Player.White)
        assert(moves.length == 2, "White camel can move north or south")
        moves = tb.moves(wm, Player.Black)
        assert(moves.length == 1 && moves[0].type == "pushpull", "White camel can be pulled by Black elephant")
        let htrapped = new Trapped(new Pos(2,2), wh)
        let pp = new PushPull(wm.piece, be.piece, wm.pos, Dir.West, Dir.North, [nothing_trapped, htrapped])
        let pull_camel = new Move(pp)
        assert(tb.valid_move(pull_camel, Player.Black), "The elephant can pull the camel, trapping the horse")
        assert(!tb.valid_move(pull_camel, Player.White), "The camel cannot push the elephant!")

        assert(tb.dead_white.length == 0, "There are no dead white pieces")
        tb.apply_move(pull_camel)
        assert(tb.get(new Pos(2,2)) == undefined, "The trap should now be empty")
        assert(tb.dead_white.length == 1, "Dead horse should be accounted for")
        assert(!tb.frozen(wm), "Camel, though pulled, is not frozen")

        move_val_apply(tb, makeStep(wm, Dir.East), Player.White)
        move_val_apply(tb, makeStep(wm, Dir.North), Player.White)

        move_val_apply(tb, makeStep(<BoardPiece>tb.get_bp(new Pos(3,0)), Dir.North), Player.White)
        move_val_apply(tb, makeStep(<BoardPiece>tb.get_bp(new Pos(3,1)), Dir.North), Player.White)

        move_val_apply(tb, makeStep(wm, Dir.North), Player.White)
        move_val_apply(tb, makeStep(wm, Dir.North), Player.White)

        let pp2 = new PushPull(br, wm.piece, new Pos(3,6), Dir.South, Dir.South, [nothing_trapped, nothing_trapped])
        move_val_apply(tb, new Move(pp2), Player.White)

        let pp3 = new PushPull(wm.piece, br, wm.pos, Dir.North, Dir.North, [nothing_trapped, nothing_trapped])
        move_val_apply(tb, new Move(pp3), Player.White)
        move_val_apply(tb, new Move(pp2), Player.White)

        move_val_apply(tb, makeStep(be, Dir.North, nothing_trapped), Player.Black)

        assert(!tb.valid_move(new Move(pp3), Player.White), "Frozen camels cannot pull")

        // Board equality checks
        let tbcopy = tb.copy()

        let rc1 = <BoardPiece>tbcopy.get_bp(new Pos(0,7))
        let rc2 = <BoardPiece>tbcopy.get_bp(new Pos(7,7))

        let r1 = tb.get_bp(new Pos(0,7))
        let r2 = tb.get_bp(new Pos(7,7))

        assert(r1 != r2, "The two copied rabbits should not be the same")
        assert(r1 != rc1 && r2 != rc2, "The original and copied rabbits should not be the same")
        assert(tb.equals(tbcopy), "Copied board should equal the original")

        rc1.pos.clone(new Pos(7,7))
        rc2.pos.clone(new Pos(0,7))
        tbcopy.set(rc1.pos,rc1)
        tbcopy.set(rc2.pos,rc2)

        assert(tbcopy.equals(tb), "Copied board should still equal the original")

        // Unfreeze the camel and do some "moves" tests
        move_val_apply(tb, makeStep(be, Dir.West, nothing_trapped), Player.Black)
        assert(!tb.frozen(wm), "Camel is no longer frozen")

        let gss = new GameState()
        gss.board.clone(tb)

        assert(gss.board.equals(tb), "Cloned board should equal its origin")

        json_string_test(gss)

        let bs1 = BoardSetup.from_board(Player.Black, tb)
        let bs2 = BoardSetup.from_board(Player.White, tb)
        gss.black_setup = bs1
        gss.white_setup = bs2

        json_string_test(gss)

    }

    export function timing_test() : void
    {
        let tbcopy = db.copy()
        let before = Date.now()
        let res : boolean = false
        for(let i = 0; i < 100000; i++)
        {
            res = tbcopy.equals(db)
        }
        let after = Date.now()
        console.log(`${res}`)
        console.info(`TIME: ${after - before}ms`)
    }


    // Generate random boards - not guaranteed to be valid board states w.r.t traps etc.
    export function random_board() : Board
    {
        let db = Board.default_board()
        db.board = []
        db.board.length=64
        for(let o of db.pieces)
        {
            if(Math.random() < 0.2)
                o.alive=false
            else
            {
                let i;
                do i = Math.round(Math.random()*63)
                    while(db.board[i]!=undefined)
                o.pos.clone(Pos.from_index(i))
                db.board[i] = o
            }
        }
        return db
    }

    export function hash_test() : any
    {
        let res : [Board, number][] = []

        let t_no = 5000

        for(let i = 0; i < t_no; i++)
        {
            let b = random_board()
            let h = b.hash()
            let s = res[h]
            if(s == undefined)
                res[h] = [b, 0]
            else
            {
                let [bb, duplis] = s
                if(!bb.equals(b))
                    s[1]++
            }
        }
        let duplis = 0
        for(let i of Object.keys(res))
        {
            duplis += (<any>res)[i][1]
        }
        console.log(`Duplicate hashes: up to ${duplis} (${100*(1 - duplis/t_no)}% unique)`)
    }

    function misc_tests()
    {
        assert(pp6.is_inverse(pp7), `These moves should be the inverse of each other: f⁻¹(${pp6}) == ${pp7}`)
        assert(pp7.is_inverse(pp6), `Inverstability should be commutative: f⁻¹(${pp7}) == ${pp6}`)
        assert(!pp5.is_inverse(pp6), `These moves should not be inverses of each other: ${pp5} ${pp6}`)
    }

    export function run_tests() : void {

        // Reset error count
        tests_passed = tests_failed = 0

        // Basic conversion tests - converting back and forth should yield identical objects
        for (let i of basics.map(json_string_test)) {
            if(i != true)
                console.error(i);
        }
        board_tests()
        misc_tests()
        console.info(`Tests passed: (${tests_passed}/${tests_failed + tests_passed})`)
        if(tests_failed != 0)
            console.error(`${tests_failed} tests failed!`)
    }
    run_tests()
}