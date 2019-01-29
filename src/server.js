var WebSocketServer = require('websocket').server;
var http = require('http');

var server = http.createServer(function(request, response) {
    // process HTTP request. Since we're writing just WebSockets
    // server we don't have to implement anything.
});

server.listen(3000, function() { });

// create the server
var wsServer = new WebSocketServer({
    httpServer: server
});

wsServer.on('open', function(questionmark) { console.log("connection opened perhaps") })

var clients = []


var turn = 0;
var board = new Board();
var status = 0
var confirmed = 0


// WebSocket server
wsServer.on('request', function(request) {

    var connection = request.accept(null, request.origin);
    console.log("connection opened")
    var index = clients.push(connection) - 1
    console.log("connections: " + String(clients.length))

    // This is the most important callback for us, we'll handle
    // all messages from users here.

    connection.on('message', function(message) {

	if (message.type === 'utf8') {

	    console.log(message)
	    var ob = JSON.parse(message.utf8Data)
	    if(ob.type == "setup")
	    {
		var response = {type : "setup", board : 0, turn : turn}
		
		connection.sendUTF(JSON.stringify(response))
	    }
	    else
	    {
		if(ob.type == "placement")
		{
		    confirmed ++;
		}
	    // process WebSocket message
		for(let i = 0; i < clients.length; i++)
		{
		    if (i != index) {
			console.log("sending moves to " + String(i))
			
			clients[i].sendUTF(message.utf8Data)
			
		    }
		}
	    }
	    if(confirmed == 2){
		console.log("Sending start signals")
		confirmed++;
		for(let i = 0; i < clients.length; i++)
		{
		    clients[i].sendUTF(JSON.stringify({type : "start"}))
		}
	    }

	    
	}
    });

    connection.on('close', function(connection) {
	// close user connection
	clients.splice(index, 1)
	console.log("User connection closed: " + connection.toString())
    });

})

console.log("== Server started ==");
