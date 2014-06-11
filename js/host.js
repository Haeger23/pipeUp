// WebRTC Project for a better UX in Q&A sessions after presentations. No need for giving around a microphone anymore.

'use strict'; //ECMA5 feature to gain more exceptions

var sendButton = document.getElementById("sendButton"),
    sendTextarea = document.getElementById("dataChannelSend"),
    receiveTextarea = document.getElementById("dataChannelReceive"),
    clientsList = document.getElementById("clients");

sendButton.onclick = sendGlobalTxtMsg;

var localStream;
var remoteStream;

// storage for connected peers
var peers = {};


/////////////////////////////////////////////


var socket = io.connect();
var room = 'pipeUp';

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
  closePeers();
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

function sendGlobalTxtMsg() {
  var data = sendTextarea.value;
  for (var peer in peers) {
    console.log(peers[peer]);
    peers[peer].sendTxtMsg(data);
    trace('Sent data: ' + data + ' to ' + peers[peer].getUsername());
  }
}


function enableMessageInterface(shouldEnable) {
  if (shouldEnable) {
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    dataChannelSend.placeholder = "";
    sendButton.disabled = false;
  } else {
    dataChannelSend.disabled = true;
    sendButton.disabled = true;
  }
}

/////////////////////////////////////////////////////

