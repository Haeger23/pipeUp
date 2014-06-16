function Peer(conf) {
  var self = this,
      pc = null,
      sendChannel = null,
      socketConf = conf,
      userDomEle = null,
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
  this.connect = function () {
    pc = new RTCPeerConnection(pc_config, pc_constraints);
    pc.onicecandidate = function (event) {
      console.log('handleIceCandidate event: ', event);
      if (event.candidate) {
        sendMessage({
          type: 'candidate',
          label: event.candidate.sdpMLineIndex,
          id: event.candidate.sdpMid,
          candidate: event.candidate.candidate}, self.getSocketId());
      } else {
        console.log('End of candidates.');
      }
    };

    pc.oniceconnectionstatechange = self.onIceConnectionStateChange;
    console.log('Created RTCPeerConnnection with:\n' +
      '  config: \'' + JSON.stringify(pc_config) + '\';\n' +
      '  constraints: \'' + JSON.stringify(pc_constraints) + '\'.');

    pc.onaddstream = self.handleRemoteStreamAdded;
    pc.onremovestream = self.handleRemoteStreamRemoved;

    this.createSendChannel();
    this.createOffer();
  },


  /////////////// Connection Funktions ////////////////////
  this.createSendChannel = function () {
    sendChannel = pc.createDataChannel(self.getSocketId(), {reliable: true});
    sendChannel.onmessage = self.handleMessage;
    trace('Created send data channel');

    sendChannel.onopen = self.sendChannelStateOpen;
    sendChannel.onclose = self.sendChannelStateClose;
  },
  this.createOffer = function () {
    //pc.addStream(localStream);
    var constraints = {'optional': [], 'mandatory': {}};
    
    constraints = self.mergeConstraints(constraints, sdpConstraints);
    console.log('Sending offer to peer, with constraints: \n' +
      '  \'' + JSON.stringify(constraints) + '\'.');
    pc.createOffer(function (sessionDescription) {
      // Set Opus as the preferred codec in SDP if Opus is present.
      sessionDescription.sdp = self.preferOpus(sessionDescription.sdp);
      pc.setLocalDescription(sessionDescription);
      sendMessage(sessionDescription, self.getSocketId());
    }, this.onError, constraints);
  },
  this.sendChannelStateOpen = function () {
    trace('Send channel state is: open');
    enableMessageInterface(true);
    clientsList.append('<li data-peer="' + self.getSocketId() + '" class="' + self.getPeerColor() + '">' + self.getUsername() + '</li>');
    userDomEle = $('li[data-peer="' + self.getSocketId() + '"]');
    userDomEle.click(function () {
      console.log('ask for Video from: ' + self.getUsername());
      sendMessage('getVideo', self.getSocketId());
    });
  },
  this.sendChannelStateClose = function () {
    trace('Send channel state is: closed');
  },
  this.handleRemoteStreamAdded = function (event) {
    console.log('Remote stream added.');
    attachMediaStream(remoteVideo, event.stream);
    remoteStream = event.stream;
  },
  this.handleRemoteStreamRemoved = function (event) {
    console.log('Remote stream removed. Event: ', event);
  },
  this.handleMessage = function (event) {
    trace('Received message: ' + event.data);
    chatContent.append('<p data-peer="' + self.getSocketId() + '"><span class="' + self.getPeerColor() + '">' + self.getUsername() + ':</span> ' + event.data + '</p>');
  },
  this.onIceConnectionStateChange = function () {
    console.log(self.getSocketId());
    trace('IceConnectionStateChanged: '+ this.iceConnectionState);
  },
  this.addIceCandidate = function (msg) {
    var candidate = new RTCIceCandidate({sdpMLineIndex:msg.label, candidate:msg.candidate});
    pc.addIceCandidate(candidate);
    console.log('Candidate added.');
  },
  this.setRemoteDescription = function (msg) {
    pc.setRemoteDescription(new RTCSessionDescription(msg));
    console.log('RemoteDescription set.');
  },

  /////////////// Logic Funktions ////////////////////

  this.sendTxtMsg = function (msg) {
    sendChannel.send(msg);
  },

  /////////////// Helper Funktions ////////////////////

  this.onError = function (err) {
    // todo Problem mit Firefox: dieser braucht diese Fkt aber so richtig funktioniert das immer noch nicht
    // https://bitbucket.org/webrtc/codelab/issue/9/call-from-firefox-to-chrome-does-not-work
    console.log('Fehler in createOffer: ' + err);
  },
  this.getUsername = function () {
    return socketConf.username;
  },
  this.getSocketId = function () {
    return socketConf.socketId;
  },
  this.getPeerColor = function () {
    return socketConf.color;
  },
  this.mergeConstraints = function (cons1, cons2) {
    var merged = cons1;
    for (var name in cons2.mandatory) {
      merged.mandatory[name] = cons2.mandatory[name];
    }
    merged.optional.concat(cons2.optional);
    return merged;
  },
  // Set Opus as the default audio codec if it's present.
  this.preferOpus = function (sdp) {
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
        var opusPayload = this.extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
        if (opusPayload) {
          sdpLines[mLineIndex] = this.setDefaultCodec(sdpLines[mLineIndex], opusPayload);
        }
        break;
      }
    }

    // Remove CN in m line and sdp.
    sdpLines = this.removeCN(sdpLines, mLineIndex);

    sdp = sdpLines.join('\r\n');
    return sdp;
  },
  this.extractSdp = function (sdpLine, pattern) {
    var result = sdpLine.match(pattern);
    return result && result.length === 2 ? result[1] : null;
  },
  // Set the selected codec to the first in m line.
  this.setDefaultCodec = function (mLine, payload) {
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
  },
  // Strip CN from sdp before CN constraints is ready.
  this.removeCN = function (sdpLines, mLineIndex) {
    var mLineElements = sdpLines[mLineIndex].split(' ');
    // Scan from end for the convenience of removing an item.
    for (var i = sdpLines.length-1; i >= 0; i--) {
      var payload = this.extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
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