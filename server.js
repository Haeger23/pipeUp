var static = require('node-static'),
    http = require('http'),
    masterSocket = {
      id: null,
      name: 'pipeUpMaster'
    },
    file = new(static.Server)(),
    app = http.createServer(function (req, res) {
            file.serve(req, res);
          }).listen(2013);

var io = require('socket.io').listen(app),
    roomName = null;

io.sockets.on('connection', function (socket){

  socket.on('create', function (room) {
    roomName = room;
    var numClients = io.sockets.clients(roomName).length;
    if (numClients == 0  || true){
      //TODO: Some kind of safty mechanism so that not everyone is able to create a room
      socket.join(room);
      masterSocket.id = socket.id;
      log('numClients: ', numClients);
      io.sockets.socket(masterSocket.id).emit('created', roomName);
    } else if (numClients > 0) {
      io.sockets.socket(masterSocket.id).emit('denied', roomName);
    }
  });

  socket.on('join', function (conf) {
    if (conf.room == roomName) {
      var numClients = io.sockets.clients(roomName).length;
      log('numClients: ', numClients);

      if (numClients > 0) {
        socket.join(roomName);
        io.sockets.socket(socket.id).emit('joined', {
          roomName: roomName,
          masterSocket: masterSocket.id});

        io.sockets.socket(masterSocket.id).emit('joined', {
          username: conf.username,
          socketId: socket.id});
      } else {
        io.sockets.socket(socket.id).emit('denied', roomName);
      }
    }
  });

  socket.on('messageTo', function (message, receiver) {
    if (receiver){
      var from = socket.id;
      io.sockets.socket(receiver).emit('message', message, from);
      log('Send message to ' + receiver + ': ', message);
    }
  });

  socket.on('message', function (message) {
    log('Got message: ', message);

    var numClients = io.sockets.clients(roomName).length;
    log('numClients: ', numClients);

    socket.broadcast.emit('message', message); // should be room only

  });

	function log(){
		var array = [">>> "];
	  for (var i = 0; i < arguments.length; i++) {
	  	array.push(arguments[i]);
	  }
	    socket.emit('log', array);
	}

});

