"use strict";

var sendButton = $("#sendButton"),
    sendInput = $("#dataChannelSend"),
    login = $('#login'),
    chatContent = $("#chatContent"),
    loginBtn = $("#loginBtn"),
    pipeUpBtn = $("#pipeUp"),
    disconnectBtn = $("#disconnect");

var pcIsAlreadyCreated,
    localStream,
    remoteStream,
    sendChannel,
    pc,

    pc_config = {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]},

    pc_constraints = {
    'optional': [
      {'DtlsSrtpKeyAgreement': true},
      {'RtpDataChannels': true}
    ]},

    // Set up audio and video regardless of what devices are present.
    sdpConstraints = {'mandatory': {
      'OfferToReceiveAudio':true,
      'OfferToReceiveVideo':true
      }
    };


var socket = io.connect(),
    room = 'pipeUp',
    masterSocketId,
    localSocketId;


sendButton.click(sendData);


/////////////////////////////////////////////

loginBtn.click(function() {
  log('join room', room);
  socket.emit('join', {
    type: 'login',
    room: room,
    username: $("#username").val()});
});

pipeUpBtn.click(function() {
  log('todo: PipeUp!');
});

disconnectBtn.click(function() {
  closePeerConnection();
});

window.onbeforeunload = function(e){
  closePeerConnection();
}

/////////////////////////////////////////////

socket.on('denied', function (room){
  log('Access denied for room ' + room);
});

socket.on('joined', function (conf){
  log('This peer has joined room ' + conf.roomName);
  masterSocketId = conf.masterSocket;
  localSocketId = socket.socket.sessionid;
});

socket.on('log', function (array){
  log.apply(console, array);
});

function sendMessage(message){
  log('Sending message: ', message);
  socket.emit('messageTo', message, masterSocketId);
}

/////////////////// SIGNALING //////////////////////

socket.on('message', function (message){
  log('Received message:', message);
  if (message.type === 'offer') {

    if (!pcIsAlreadyCreated) {
        createPeerConnection();
        pcIsAlreadyCreated = true;
    }

    if (localStream)
      pc.addStream(localStream);

    pc.setRemoteDescription(new RTCSessionDescription(message));

    log('Sending answer to peer.');
    pc.createAnswer(function (sessionDescription) {
        // Set Opus as the preferred codec in SDP if Opus is present.
        sessionDescription.sdp = preferOpus(sessionDescription.sdp);
        pc.setLocalDescription(sessionDescription);
        sendMessage(sessionDescription);
      }, onError, sdpConstraints);

  } else if (message.type === 'candidate' && pcIsAlreadyCreated) {
    var candidate = new RTCIceCandidate({sdpMLineIndex:message.label,
                                         candidate:message.candidate});
    pc.addIceCandidate(candidate);
    log('Candidate added.');
  } else if (message === 'close' && pcIsAlreadyCreated) {
    closePeerConnection();
  } else if (message === 'getVideo' && pcIsAlreadyCreated) {
    getUserMedia(constraints, handleUserMedia, handleUserMediaError);
  }
});

function onError (err) {
  log('Fehler in createAnswer: ' + err);
};

////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');
var constraints = {audio: true, video: true};

function handleUserMedia(stream) {
  localStream = stream;
  attachMediaStream(localVideo, stream);
  log('Adding local stream.');
  sendMessage('got user media');
}

function handleUserMediaError(error){
  log('getUserMedia error: ', error);
}
/////////////////////////////////////////////////////////

function createPeerConnection() {
  pc = new RTCPeerConnection(pc_config, pc_constraints);
  pc.onicecandidate = handleIceCandidate;
  log('Created RTCPeerConnnection with:\n' +
    '  config: \'' + JSON.stringify(pc_config) + '\';\n' +
    '  constraints: \'' + JSON.stringify(pc_constraints) + '\'.');
  pc.oniceconnectionstatechange = function () {
    log('IceConnectionStateChanged: '+ this.iceConnectionState);
  }
  pc.onaddstream = handleRemoteStreamAdded;
  pc.onremovestream = handleRemoteStreamRemoved;

  pc.ondatachannel = gotReceiveChannel;
}

function sendData() {
  var data = sendInput.val();
  sendChannel.send(data);
  log('Sent data: ' + data);
}

function gotReceiveChannel(event) {
  log('Receive Channel Callback');
  sendChannel = event.channel;
  sendChannel.onmessage = handleMessage;
  sendChannel.onopen = handleReceiveChannelStateChange;
  sendChannel.onclose = handleReceiveChannelStateChange;
}

function handleMessage(event) {
  var msg = JSON.parse(event.data);
  log('Received message: ' + msg.text);
  log(event);

  var myself = (msg.socketConf.socketId === localSocketId) ? 'class="myself"' : '';
  chatContent.append('<p ' + myself + ' data-peer="' + msg.socketConf.socketId +
    '"><span class="' + msg.socketConf.color +
    '">' + msg.socketConf.username + ': </span>' + msg.text + '</p>');
}

function handleReceiveChannelStateChange() {
  var readyState = sendChannel.readyState;
  log('Receive channel state is: ' + readyState);
  enableMessageInterface(readyState == "open");
}

function enableMessageInterface(shouldEnable) {
  if (shouldEnable) {
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    dataChannelSend.placeholder = "";
    sendButton.prop("disabled", false);
    login.hide();
  } else {
    dataChannelSend.disabled = true;
    sendButton.prop("disabled", true);
    login.show();
  }
}

function handleIceCandidate(event) {
  log('handleIceCandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate});
  } else {
    log('End of candidates.');
  }
}

function handleRemoteStreamAdded(event) {
  log('Remote stream added.');
  attachMediaStream(remoteVideo, event.stream);
  remoteStream = event.stream;
}
function handleRemoteStreamRemoved(event) {
  log('Remote stream removed. Event: ', event);
}

function closePeerConnection() {
  sendMessage('close');
  pcIsAlreadyCreated = false;
  pc.close();
  pc = null;
  log('Session closed.');
}

///////////////////////////////////////////

// Set Opus as the default audio codec if it's present.
function preferOpus(sdp) {
  var sdpLines = sdp.split('\r\n');
  var mLineIndex;
  // Search for m line.
  for (var i = 0; i < sdpLines.length; i++) {
      if (sdpLines[i].search('m=audio') !== -1) {
        mLineIndex = i;
        break;
      }
  }
  if (mLineIndex === null) {
    return sdp;
  }

  // If Opus is available, set it as the default in m line.
  for (i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('opus/48000') !== -1) {
      var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
      if (opusPayload) {
        sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
      }
      break;
    }
  }

  // Remove CN in m line and sdp.
  sdpLines = removeCN(sdpLines, mLineIndex);

  sdp = sdpLines.join('\r\n');
  return sdp;
}

function extractSdp(sdpLine, pattern) {
  var result = sdpLine.match(pattern);
  return result && result.length === 2 ? result[1] : null;
}

// Set the selected codec to the first in m line.
function setDefaultCodec(mLine, payload) {
  var elements = mLine.split(' ');
  var newLine = [];
  var index = 0;
  for (var i = 0; i < elements.length; i++) {
    if (index === 3) { // Format of media starts from the fourth.
      newLine[index++] = payload; // Put target payload to the first.
    }
    if (elements[i] !== payload) {
      newLine[index++] = elements[i];
    }
  }
  return newLine.join(' ');
}

// Strip CN from sdp before CN constraints is ready.
function removeCN(sdpLines, mLineIndex) {
  var mLineElements = sdpLines[mLineIndex].split(' ');
  // Scan from end for the convenience of removing an item.
  for (var i = sdpLines.length-1; i >= 0; i--) {
    var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
    if (payload) {
      var cnPos = mLineElements.indexOf(payload);
      if (cnPos !== -1) {
        // Remove CN payload from m line.
        mLineElements.splice(cnPos, 1);
      }
      // Remove CN line in sdp
      sdpLines.splice(i, 1);
    }
  }

  sdpLines[mLineIndex] = mLineElements.join(' ');
  return sdpLines;
}

/////////////// GLOBAL Helper //////////////////////////////

var doLog = true; // control logging
var log = function (data, data2) {
  if (doLog) {
    console.log(data, data2 || '');
  }
}