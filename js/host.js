// WebRTC Project for a better UX in Q&A sessions after presentations. No need for giving around a microphone anymore.

'use strict'; //ECMA5 feature to gain more exceptions

var sendButton =  $("#sendButton"),
    sendInput =   $("#dataChannelSend"),
    chatContent = $("#chatContent"),
    clientsList = $("#clients");

sendButton.click(sendGlobalTxtMsg);

var localStream;
var remoteStream;
var peerColor = 1;

// storage for connected peers
var peers = {};


/////////////////////////////////////////////


var socket = io.connect();
var room = 'pipeUp';

var hqSocketConf = {
      username: 'hq',
      peerColor: 'color0'
    };

console.log('Create room', room);
socket.emit('create', room);


socket.on('created', function (room){
  console.log('Created room ' + room);
});

socket.on('denied', function (room){
  console.log('denied - room ' + room + ' already exists');
});

socket.on('joined', function (conf){
  var peer = new Peer();
  conf.color = getColorForPeer();
  peer.create(conf);
  // save peer in peers Obj
  peers[conf.socketId] = peer;
  console.log(conf.username + ' has joined');
});

socket.on('log', function (array){
  console.log.apply(console, array);
});

function sendMessage(message, receiver){
  console.log('Sending message: ', message);
  if (receiver)
    socket.emit('messageTo', message, receiver);
  else
    socket.emit('message', message);
}

/////////////////// SIGNALING //////////////////////

socket.on('message', function (message, from){
  console.log('Received message:', message);
  var peer = peers[from];
  if (message === 'got user media') {
    //Verbindung erneuern
    peer.createOffer();
  } else if (message.type === 'answer') {
    peer.setRemoteDescription(message);
  } else if (message.type === 'candidate') {
    peer.addIceCandidate(message);
  } else if (message === 'bye') {
    //todo Close sessions - garbage collection
    //closePeer(from);
  }
});

////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');


window.onbeforeunload = function(e){
  //closePeers();
}

/////////////////////////////////////////////////////////

function closePeer(socketId) {
  peers[socketId].close();
  console.log('Peer closed: ' + socketId);
}

function closePeers() {
  for (var peer in peers) {
    peers[peer].close();
    //peers[peer].delete;
  }
  sendMessage('Server closed session');
  console.log('Session closed.');
}

function getColorForPeer() {
  return 'color' + peerColor++;
}

// todo die fkt ist irgendwie noch nicht so
function sendGlobalTxtMsg() {
  var msg = JSON.stringify({
    type: "message",
    text: sendInput.val(),
    socketConf: hqSocketConf
  });

  for (var peer in peers) {
      peers[peer].sendTxtMsg(msg);
  }

  trace('Sent data: ' + msg.text + ' to everybody');
}

function forwardGlobalTxtMsg(sender, msg) {
  var msg = JSON.stringify({
    type: "message",
    text: msg,
    socketConf: peers[sender].socketConf
  });

  for (var peer in peers) {
    if (peer.getSocketId() != sender)
      peers[peer].sendTxtMsg(msg);
  }

  trace('forwarded msg: ' + msg.text + ' to everybody');
}


function enableMessageInterface(shouldEnable) {
  if (shouldEnable) {
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    dataChannelSend.placeholder = "";
    sendButton.prop("disabled", false);
  } else {
    dataChannelSend.disabled = true;
    sendButton.prop("disabled", true);
  }
}

/////////////////////////////////////////////////////

