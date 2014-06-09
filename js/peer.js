  function Peer() {
    return {
      pc: null,
      sendChannel: null,
      socketConf: null,
      userDomEle: null,
      constraints: {audio: false, video: true},
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
        var pc = this.pc = new RTCPeerConnection(this.pc_config, this.pc_constraints);

        pc.oncecandidate = this.onIceCandidate;
        console.log('Created RTCPeerConnnection with:\n' +
          '  config: \'' + JSON.stringify(this.pc_config) + '\';\n' +
          '  constraints: \'' + JSON.stringify(this.pc_constraints) + '\'.');

        pc.onaddstream = this.handleRemoteStreamAdded;
        pc.onremovestream = this.handleRemoteStreamRemoved;

        this.createSendChannel();
        this.createOffer();
      },
      createSendChannel: function () {
        var sc = this.sendChannel= this.pc.createDataChannel(this.socketConf.socketId, {reliable: true});
        sc.onmessage = this.handleMessage;
        trace('Created send data channel');

        sc.onopen = this.sendChannelStateOpen;
        sc.onclose = this.sendChannelStateClose;
      },
      createOffer: function () {
        //pc.addStream(localStream);
        var constraints = {'optional': [], 'mandatory': {}},
            self = this;
        constraints = this.mergeConstraints(constraints, this.sdpConstraints);
        console.log('Sending offer to peer, with constraints: \n' +
          '  \'' + JSON.stringify(constraints) + '\'.');
        this.pc.createOffer(function(sessionDescription) {
          // Set Opus as the preferred codec in SDP if Opus is present.
          sessionDescription.sdp = self.preferOpus(sessionDescription.sdp);
          self.pc.setLocalDescription(sessionDescription);
          sendMessage(sessionDescription, self.getSocketId());
        }, null, constraints);
      },
      sendChannelStateOpen: function () {
        trace('Send channel state is: open');
        enableMessageInterface(true);
        clientsList.innerHTML = clientsList.innerHTML + '<li id="' + this.getSocketId() + '">' + this.getUsername() + '</li>';
        this.userDomEle = document.getElementById(this.getSocketId());
        this.userDomEle.onclick = this.getVideo;
      },
      sendChannelStateClose: function () {
        trace('Send channel state is: closed');
      },
      getVideo: function () {
          console.log('ask for Video from: ' + this.getUsername());
          sendMessage('getVideo', this.getSocketId());
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
        receiveTextarea.value = receiveTextarea.value + this.label + ': ' + event.data + '\\n';
      },
      onIceCandidate: function (event) {
        console.log('handleIceCandidate event: ', event);
        if (event.candidate) {
          socket.emit('messageTo', {
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate}, this.getSocketId);
        } else {
          console.log('End of candidates.');
        }
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
      setChannelEvents: function () {

      },
      setChannelEvents: function () {

      },
      attachMediaStreams: function () {

      },
      getStreamInfo: function () {

      },
      recreateOffer: function () {

      },


      /////////////// Helper Funktions ////////////////////
      getUsername: function () {
        return this.socketConf.username;
      },
      getSocketId: function () {
        return this.socketConf.socketId;
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