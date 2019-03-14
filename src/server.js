var WebSocketServer = require('websocket').server;
var http = require('http');

var server = http.createServer();
server.listen(3000);

// create the server
var wsServer = new WebSocketServer({
    httpServer: server
});

var clients = []

var turn = 0;
var board = new Board()
var status = 0
var confirmed = 0

var cache = []
function render(key, value) {
    if (typeof value === 'object' && value !== null) {
        if (cache.indexOf(value) !== -1) {
            // Duplicate reference found
            try {
                // If this value does not reference a parent it can be deduped
                return JSON.parse(JSON.stringify(value));
            } catch (error) {
                // discard key if value cannot be deduped
                return;
            }
        }
        // Store value in our collection
        cache.push(value);
    }
    return value;
}

// WebSocket server
wsServer.on('request', function(request) {

	// console.log(JSON.stringify(request, render, 2))

	var connection = request.accept(null, request.origin)

	// console.log("connection opened")

	var index = clients.push(connection) - 1

	// console.log("connections: " + String(clients.length))

	// This is the most important callback for us,
	// we'll handle all messages from users here.

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
