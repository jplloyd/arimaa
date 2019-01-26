/* Vue instance data, methods, etc. */
let board = new Board()

let side_selection = 0
let piece_setup = 1
let play = 2
let game_done = 3


let setup = function()
{
    window.WebSocket = window.WebSocket || window.MozWebSocket
    let conn = new WebSocket('ws://81.8.161.106:3000')

    window.conn = conn
    
    player = window.location.hash.slice(1) % 2

    conn.onopen=function(){
	console.log("Connection hath been opened");
	conn.send(JSON.stringify({type: "setup", player: player}))
    }

    conn.onmessage = function(msg)
    {
	console.log(msg)
	let msgob = JSON.parse(msg.data)
	if(msgob.type == "setup")
	{
	    window.vm = new Vue(obfun(new Board(), player))
	}
	else if(msgob.type == "moveset")
	{
	    console.log(msgob)
	    var moves = moves_from_json(msgob.moves)
	    window.vm.turn++
	    window.vm.ts.base_board.apply_set(moves)
	    window.vm.ts.turn_board.clone(window.vm.ts.base_board)
	}
    }

    window.inc_call = function(a)
    {
	conn.send(JSON.stringify(a))
    }
}

function send_moves()
{
    console.log("Time to send those moves")
    window.conn.send(JSON.stringify({type : "moveset", moves : moves_to_json(window.vm.ts.moveset())}))
    window.vm.ts.apply()
}


let obfun = function(board, player)
{
    return {
    el: "#main",
    data: {
	ts : new TurnState(board, player),
        active: null, // position
	pusher: null, // position
	status: 2,
        turn: 0,
	markers_dyn : undefined,
    },
    computed: {
	side_selection : function(){ return this.status == side_selection ;},
	piece_setup : function(){ return this.status == piece_setup;},
	/* markers are (coord, styleclass, callback)-tuples*/
	player: function(){ return this.ts.player; },
        markers: function () {
	    if (this.markers_dyn)
	    {
		return this.markers_dyn();
	    }
	    else
	    {
		return [];
	    }
        },
	markers_alt: function()
	{

	    console.log("Markers tick");

	    if(this.pusher != null)
	    {
		return dests(this.board, this.player, this.active);
	    }
	    else if(this.active != null)
	    {
		return moves(this.board, this.player, this.active);
	    }
	    else
	    {
		return [];
	    }
	},
	valid_turn: function() {
	    let m = this.ts.moves()
	    return m < 5 && m > 0
	},
        player_turn: function () {
            return this.turn % 2 == 0 ? 'White' : 'Black'
        },
	live_pieces: function() {
	    return this.board.pieces()
	    //return this.board.board.filter(function(p){ return p != null; })
	},
	board: function()
	{
	    return this.ts.turn_board;
	},
	your_turn: function()
	{
	    return this.turn % 2 == this.ts.player
	},
	moves_made: function()
	{
	    return this.ts.moves()
	},
	status_msg: function() {
	    switch(this.status){
	    case 0: return "Choose your side";
	    case 1: return "Set up your pieces";
	    case 2: if(this.turn % 2 == this.ts.player){ return "Your turn to play"; } else return "Opponents turn to play";
	    }
	}
    },
    methods: {
	dest_class : function(m)
	{
	    let p = this.ts.turn_board.get_s(this.active)
	    if(unguarded_trap(this.ts.turn_board.board, p, m[0]))
	    {
		return "death"
	    }
	    if(m[1] != MoveType.Step && this.pusher == null)
	    {
		return "pusher"
	    }
	    return "clear"
	},
	deactivate : function(){
	    console.log("Deactivate")
	    this.active = null
	    this.pusher = null
	    this.markers_dyn = undefined
	},
	orig_click: function(origin){

	    if(!this.your_turn)
	    {
		this.deactivate()
		return
	    }
	    
	    if(origin.equals(this.active))
		this.deactivate()
	    else
	    {
		this.deactivate()
		this.active = origin
	    }
	},
        dest_click: function (dest) {
	    console.log(dest[0].toString())

	    if(dest[1] == MoveType.Step)
	    {
		this.ts.add_move(new Step(this.active, dest[0]))
		this.deactivate()	
	    }
	    else if(this.pusher == null)
	    {
		this.pusher = this.active;
		this.active = dest[0]
	    }
	    else
	    {
		this.ts.add_move(new PushPull(this.pusher, this.active, dest[0]))
		this.deactivate()
	    }
	    /*
	    if(dest[1] == MoveType.Step)
	    {
		this.ts.add_move(new Step(this.active, dest[0]))
		this.deactivate()
	    }
	    else // Push or pull
	    {
		if(this.pusher != null)
		{
		    console.log("Adding an actual move")
		    this.ts.add_move(new PushPull(this.pusher, this.active, dest[0]))
		    this.deactivate()
		}
		else
		{
		    console.log("Preparing for an actual move");
		    this.pusher = this.active
		    this.active = dest[0]
		    this.markers_dyn = function()
		    {
			console.log("These markesr should be shown")
			return dests(this.ts.turn_board, this.player, this.active)
		    }
		}
	    }*/
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
        },
	end_turn: function()
	{
	    this.turn++
	    send_moves()
	}
    }
}
}
