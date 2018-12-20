/* Vue instance data, methods, etc. */
let board = new Board()
let ob = {
    el: "#main",
    data: {
        board: board,
	old_board : board,
        moves_remaining: 4,
        limbo_piece: undefined,
        active: null,
	status: 0,
        player: 0,
        turn: 0
    },
    computed: {
	/* markers are (coord, styleclass, callback)-tuples*/
        markers: function () {
            if (this.active != null) {
                return this.board.move_squares(this.active);
            }
            else {
                return [];
            }

        },
        player_turn: function () {
            return this.turn % 2 == 0 ? 'White' : 'Black'
        },
	live_pieces: function() {
	    return filter(this.board.board, function(p){ return p != null; })
	},
	status_msg: function() {
	    switch(this.status){
	    case 0: return "Choose your side";
	    case 1: return "Your turn to play";
	    case 2: return "Opponents turn to play";
	    }
	}
    },
    methods: {
        dest_click: function (origin, destination) {
            if (board.square(destination)) { }
            else { board.move_piece(origin, destination) }
        },
        piece_c: function (pc) { return piece_class(pc); },
        pos: function (x, y) { 
                return { top: this.offset(y), left: this.offset(x) }
        },
        board_letter: function (n) { return "ABCDEFGH"[n]; },
        offset: function(n) {
                let offs = 12.5 * n
                offs = this.player == 0 ? 87.5 - offs : offs
                return offs + "%"
        },
        letter_pos: function (is_top, n) {
            let obj = new Object()
            obj.left = this.offset(7-n)
            if (is_top) {
                obj.top = '-8.1395%'
            } else {
                obj.bottom = '-8.1395%'
            }
            return obj
        },
        number_pos: function (left_side, n) {
            let obj = { top: this.offset(n) };
            if (left_side) { obj.left = '-8.1395%' }
            else { obj.right = '-8.1395%' }
            return obj
        }

    }
}
