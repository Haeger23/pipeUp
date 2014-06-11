function Peer() {
  return {
    pc: null,
    sendChannel: null,
    socketConf: null,
    userDomEle: null,
    constraints: {audio: true, video: true},
    pc_config: {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]},
    pc_constraints: {
      'optional': [
        {'DtlsSrtpKeyAgreement': true},
        {'RtpDataChannels': true}
      ]
    },
    // Set up audio and video regardless of what devices are present.
    sdpConstraints: {
      'mandatory': {
        'OfferToReceiveAudio':true,
        'OfferToReceiveVideo':true
      }
    },
    create: function (socketConf) {
      this.socketConf = socketConf;

      // to fix scope problems
      RTCPeerConnection.prototype.parentScope = this;

      var pc = this.pc = new RTCPeerConnection(this.pc_config, this.pc_constraints);
      pc.onicecandidate = function (event) {
        console.log('handleIceCandidate event: ', event);
        if (event.candidate) {
          sendMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate}, this.parentScope.getSocketId());
        } else {
          console.log('End of candidates.');
        }
      };

      pc.oniceconnectionstatechange = this.onIceConnectionStateChange;
      console.log('Created RTCPeerConnnection with:\n' +
        '  config: \'' + JSON.stringify(this.pc_config) + '\';\n' +
        '  constraints: \'' + JSON.stringify(this.pc_constraints) + '\'.');

      pc.onaddstream = this.handleRemoteStreamAdded;
      pc.onremovestream = this.handleRemoteStreamRemoved;

      this.createSendChannel();
      this.createOffer();
    },


    /////////////// Connection Funktions ////////////////////
    createSendChannel: function () {
      var sc = this.sendChannel = this.pc.createDataChannel(this.getSocketId(), {reliable: true});
      sc.parentScope = this;
      sc.onmessage = this.handleMessage;
      trace('Created send data channel');

      sc.onopen = this.sendChannelStateOpen;
      sc.onclose = this.sendChannelStateClose;
    },
    createOffer: function () {
      //pc.addStream(localStream);
      var constraints = {'optional': [], 'mandatory': {}},
          ps = this;
      constraints = this.mergeConstraints(constraints, this.sdpConstraints);
      console.log('Sending offer to peer, with constraints: \n' +
        '  \'' + JSON.stringify(constraints) + '\'.');
      this.pc.createOffer(function (sessionDescription) {
        // Set Opus as the preferred codec in SDP if Opus is present.
        sessionDescription.sdp = ps.preferOpus(sessionDescription.sdp);
        ps.pc.setLocalDescription(sessionDescription);
        sendMessage(sessionDescription, ps.getSocketId());
      }, this.onError, constraints);
    },
    sendChannelStateOpen: function () {
      var ps = this.parentScope;

      trace('Send channel state is: open');
      enableMessageInterface(true);
      clientsList.append('<li data-peer="' + this.parentScope.getSocketId() + '" class="' + this.parentScope.getPeerColor() + '">' + this.parentScope.getUsername() + '</li>');
      this.userDomEle = $('li[data-peer="' + ps.getSocketId() + '"]');
      this.userDomEle.click(function () {
        console.log('ask for Video from: ' + ps.getUsername());
        sendMessage('getVideo', ps.getSocketId());
      });
    },
    sendChannelStateClose: function () {
      trace('Send channel state is: closed');
    },
    handleRemoteStreamAdded: function (event) {
      console.log('Remote stream added.');
      attachMediaStream(remoteVideo, event.stream);
      remoteStream = event.stream;
    },
    handleRemoteStreamRemoved: function (event) {
      console.log('Remote stream removed. Event: ', event);
    },
    handleMessage: function (event) {
      trace('Received message: ' + event.data);
      chatContent.append('<p data-peer="' + this.parentScope.getSocketId() + '"><span class="' + this.parentScope.getPeerColor() + '">' + this.parentScope.getUsername() + ':</span> ' + event.data + '</p>');
    },
    onIceConnectionStateChange: function () {
      console.log(this.parentScope.getSocketId());
      trace('IceConnectionStateChanged: '+ this.iceConnectionState);
    },
    addIceCandidate: function (msg) {
      var candidate = new RTCIceCandidate({sdpMLineIndex:msg.label, candidate:msg.candidate});
      this.pc.addIceCandidate(candidate);
      console.log('Candidate added.');
    },
    setRemoteDescription: function (msg) {
      this.pc.setRemoteDescription(new RTCSessionDescription(msg));
      console.log('RemoteDescription set.');
    },

    /////////////// Logic Funktions ////////////////////

    sendTxtMsg: function (msg) {
      this.sendChannel.send(msg);
    },

    /////////////// Helper Funktions ////////////////////

    onError: function (err) {
      // todo Problem mit Firefox: dieser braucht diese Fkt aber so richtig funktioniert das immer noch nicht
      // https://bitbucket.org/webrtc/codelab/issue/9/call-from-firefox-to-chrome-does-not-work
      console.log('Fehler in createOffer: ' + err);
    },
    getUsername: function () {
      return this.socketConf.username;
    },
    getSocketId: function () {
      return this.socketConf.socketId;
    },
    getPeerColor: function () {
      return this.socketConf.color;
    },
    mergeConstraints: function (cons1, cons2) {
      var merged = cons1;
      for (var name in cons2.mandatory) {
        merged.mandatory[name] = cons2.mandatory[name];
      }
      merged.optional.concat(cons2.optional);
      return merged;
    },
    // Set Opus as the default audio codec if it's present.
    preferOpus: function (sdp) {
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
    extractSdp: function (sdpLine, pattern) {
      var result = sdpLine.match(pattern);
      return result && result.length === 2 ? result[1] : null;
    },
    // Set the selected codec to the first in m line.
    setDefaultCodec: function (mLine, payload) {
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
    removeCN: function (sdpLines, mLineIndex) {
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
}