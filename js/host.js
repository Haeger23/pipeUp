// WebRTC Project for a better UX in Q&A sessions after presentations. No need for giving around a microphone anymore.

'use strict'; //ECMA5 feature to gain more exceptions

var sendButton = document.getElementById("sendButton"),
    sendTextarea = document.getElementById("dataChannelSend"),
    receiveTextarea = document.getElementById("dataChannelReceive"),
    clientsList = document.getElementById("clients");

sendButton.onclick = sendData;

var localStream;
var remoteStream;
var turnReady;

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
    console.log('Session terminated.');
  }
});

////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

if (location.hostname != "localhost") {
  requestTurn('https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913');
}

window.onbeforeunload = function(e){
	sendMessage('bye');
}

/////////////////////////////////////////////////////////


function sendData() {
  var data = sendTextarea.value;
  for (var peer in peers) {
    console.log(peers[peer]);
    peers[peer].sendChannel.send(data);
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


function requestTurn(turn_url) {
  var turnExists = false;
  for (var i in pc_config.iceServers) {
    if (pc_config.iceServers[i].url.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log('Getting TURN server from ', turn_url);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function(){
      if (xhr.readyState === 4 && xhr.status === 200) {
        var turnServer = JSON.parse(xhr.responseText);
        console.log('Got TURN server: ', turnServer);
        pc_config.iceServers.push({
          'url': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open('GET', turn_url, true);
    xhr.send();
  }
}

/////////////////////////////////////////////////////

