"use strict";

////////////////////////////////////////////////////////////
/////////////// PipeUpHost Object //////////////////////////
////////////////////////////////////////////////////////////

function PipeUpHost() {
  var self = this,
      room = 'pipeUp',
      peers = {}, // storage for connected peers
      peerColor = 1,
      localStream,
      remoteStream,
      hqSocketConf = {
        username: 'hq',
        color: 'color0',
        socketId: null
      };


  var socket = io.connect();
  log('Create room', room);
  socket.emit('create', room);


  socket.on('created', function (room){
    log('Created room ' + room);
    // save socketId of host
    hqSocketConf.socketId = this.socket.sessionid;
  });

  socket.on('denied', function (room){
    log('denied - room ' + room + ' already exists');
  });

  socket.on('joined', function (conf){
    conf.color = getNewColorForPeer();
    var peer = new Peer(conf, self);
    peer.createConnection();

    // save peer in peers Obj
    peers[conf.socketId] = peer;
    log(conf.username + ' has joined');
  });

  /////////////////// SIGNALING //////////////////////

  socket.on('message', function (message, from){
    log('Received message:', message);
    var peer = peers[from];
    if (message === 'got user media') {
      //Verbindung erneuern
      peer.createOffer();
    } else if (message.type === 'answer') {
      peer.setRemoteDescription(message);
    } else if (message.type === 'candidate') {
      peer.addIceCandidate(message);
    } else if (message === 'close') {
      // end session to peer
      closePeer(peer);
    }
  });

  //////////////////// Trigger Functions /////////////
  // these functions are the interface to frontend operations

  this.onClosePeer = function () {};
  this.onPeerAdded = function () {};
  // peer is the sender of the message
  this.onChatMessageReceive = function (peer, msg) {};

  ////////////////////////////////////////////////////

  this.sendGlobalTxtMsg = function (message, sender) {
    var msg = JSON.stringify({
      type: "message",
      text: message,
      socketConf: (!sender) ? hqSocketConf : peers[sender].getSocketConf()
    });

    for (var peer in peers) {
      peers[peer].sendTxtMsg(msg);
    }

    log('Sent Message to everybody');
  }

  this.sendSocketMessage = function (message, receiver){
    log('Sending message: ', message);
    if (receiver)
      socket.emit('messageTo', message, receiver);
    else
      socket.emit('message', message);
  }


  this.getPeers = function () {
    return peers;
  }

  this.getSpeaker = function (peer) {
    self.sendSocketMessage('getVideo', peer.getSocketId());
  }

  var getNewColorForPeer = function () {
    if (peerColor == 10)
      peerColor = 0;
    return 'color' + peerColor++;
  }

  this.getHqSocketConf = function () {
    return hqSocketConf;
  }

  var closePeer = function (peer) {
    self.onClosePeer(peer);
    peer.close();
    delete peers[peer.getSocketId()];
    log('Peer closed: ' + peer.getUsername());
  }

  this.closeAllPeers = function () {
    self.sendSocketMessage('Server is closing session');
    for (var peer in peers) {
      closePeer(peer);
    }
    log('Session closed.');
  }
}

////////////////////////////////////////////////////////////
/////////////// Peer Object ////////////////////////////////
////////////////////////////////////////////////////////////

function Peer(conf, parent) {
  var self = this,
      pc = null,
      sendChannel = null,
      socketConf = conf,
      pipedUp = false,
      userListItem = null, // saves the DomElement (li) of connected users list for this peer
      constraints = {audio: true, video: true},
      pc_config = {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]},
      pc_constraints = {
        'optional': [
          {'DtlsSrtpKeyAgreement': true},
          {'RtpDataChannels': true}
        ]
      },
      // Set up audio and video regardless of what devices are present.
      sdpConstraints = {
        'mandatory': {
          'OfferToReceiveAudio':true,
          'OfferToReceiveVideo':true
        }
      };

  /////////////// Connection Funktions ////////////////////

  this.createConnection = function () {
    pc = new RTCPeerConnection(pc_config, pc_constraints);
    pc.onicecandidate = function (event) {
      log('handleIceCandidate event: ', event);
      if (event.candidate) {
        parent.sendSocketMessage({
          type: 'candidate',
          label: event.candidate.sdpMLineIndex,
          id: event.candidate.sdpMid,
          candidate: event.candidate.candidate}, self.getSocketId());
      } else {
        log('End of candidates.');
      }
    };

    pc.oniceconnectionstatechange = onIceConnectionStateChange;
    log('Created RTCPeerConnnection with:\n' +
      '  config: \'' + JSON.stringify(pc_config) + '\';\n' +
      '  constraints: \'' + JSON.stringify(pc_constraints) + '\'.');

    pc.onaddstream = self.handleRemoteStreamAdded;
    pc.onremovestream = self.handleRemoteStreamRemoved;

    this.createSendChannel();
    this.createOffer();
  }

  this.createSendChannel = function () {
    sendChannel = pc.createDataChannel(self.getSocketId(), {reliable: true});
    sendChannel.onmessage = self.handleChatMessage;
    log('Created send data channel');

    sendChannel.onopen = parent.onPeerAdded(self);;
    sendChannel.onclose = sendChannelStateClose;
  }
  this.createOffer = function () {
    var constraints = {'optional': [], 'mandatory': {}};

    constraints = self.mergeConstraints(constraints, sdpConstraints);
    log('Sending offer to peer, with constraints: \n' +
      '  \'' + JSON.stringify(constraints) + '\'.');
    pc.createOffer(function (sessionDescription) {
      // Set Opus as the preferred codec in SDP if Opus is present.
      sessionDescription.sdp = preferOpus(sessionDescription.sdp);
      pc.setLocalDescription(sessionDescription);
      parent.sendSocketMessage(sessionDescription, self.getSocketId());
    }, this.onError, constraints);
  }

  var sendChannelStateClose = function () {
    log('Send channel state is: closed');
  }
  var sendChannelStateOpen = function () {
    log('Send channel state is: open');
  }
  this.handleChatMessage = function (event) {
    parent.sendGlobalTxtMsg(event.data, self.getSocketId());
    parent.onChatMessageReceive(self, event.data);
  };
  this.handleRemoteStreamAdded = function (event) {
    log('Remote stream added.');
    attachMediaStream(remoteVideo, event.stream);
    remoteStream = event.stream;
  }
  this.handleRemoteStreamRemoved = function (event) {
    log('Remote stream removed. Event: ', event);
  }

  var onIceConnectionStateChange = function () {
    log(self.getUsername() + ': IceConnectionStateChanged: '+ this.iceConnectionState);

  }
  this.addIceCandidate = function (msg) {
    var candidate = new RTCIceCandidate({sdpMLineIndex:msg.label, candidate:msg.candidate});
    pc.addIceCandidate(candidate);
    log('Candidate added.');
  }
  this.setRemoteDescription = function (msg) {
    pc.setRemoteDescription(new RTCSessionDescription(msg));
    log('RemoteDescription set.');
  }

  //////////////////// Trigger Functions /////////////


  /////////////// Helper Funktions ////////////////////

  this.sendTxtMsg = function (msg) {
    sendChannel.send(msg);
  }

  this.onError = function (err) {
    // todo Problem mit Firefox: dieser braucht diese Fkt aber so richtig funktioniert das immer noch nicht
    // https://bitbucket.org/webrtc/codelab/issue/9/call-from-firefox-to-chrome-does-not-work
    log('Fehler in createOffer: ' + err);
  }

  this.getUsername = function () {
    return socketConf.username;
  }

  this.getSocketId = function () {
    return socketConf.socketId;
  }

  this.getPeerColor = function () {
    return socketConf.color;
  }

  this.getSocketConf = function () {
    return socketConf;
  }


  this.close = function () {
    pc.close();
    pc = null;
  }

  this.mergeConstraints = function (cons1, cons2) {
    var merged = cons1;
    for (var name in cons2.mandatory) {
      merged.mandatory[name] = cons2.mandatory[name];
    }
    merged.optional.concat(cons2.optional);
    return merged;
  }
  // Set Opus as the default audio codec if it's present.
  var preferOpus = function (sdp) {
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
  var extractSdp = function (sdpLine, pattern) {
    var result = sdpLine.match(pattern);
    return result && result.length === 2 ? result[1] : null;
  }
  // Set the selected codec to the first in m line.
  var setDefaultCodec = function (mLine, payload) {
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
  var removeCN = function (sdpLines, mLineIndex) {
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
}

////////////////////////////////////////////////////////////
/////////////// PipeUpClient Object //////////////////////////
////////////////////////////////////////////////////////////

function PipeUpClient() {

}

/////////////// GLOBAL Helper //////////////////////////////

var doLog = true; // control logging
var log = function (data, data2) {
  if (doLog) {
    console.log(data, data2 || '');
  }
}

var Peers = function () {
  var list = new Array();

  this.getList = function () {

  }

  this.addPeer = function (conf, parent) {
    conf.color = getNewColorForPeer();
    var peer = new Peer(conf, parent);
    peer.createConnection();
    // save peer in list object
    list.push(peer);
  }

  // Moves an Item to the top or right after the last piped up item
  this.pipeUp = function (item) {
    //for ()
    list.splice(2, 0, item); // copy
    list.splice(3, 1); // delete
  }

}