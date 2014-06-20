"use strict";

// WebRTC Project for a better UX in Q&A sessions after presentations.
// No need for giving around a microphone anymore.

var sendButton =  $("#sendButton"),
    closeButton =  $("#closeButton"),
    sendInput =   $("#dataChannelSend"),
    chatContent = $("#chatContent"),
    clientsList = $("#clients"),
    localVideo = document.querySelector('#localVideo'),
    remoteVideo = document.querySelector('#remoteVideo');

var pipeUp = new PipeUpHost();

pipeUp.onPeerAdded = function (peer) {
  trace('Send channel state is: open');
  enableMessageInterface(true);
  clientsList.append('<li data-peer="' + peer.getSocketId() + '" class="' + peer.getPeerColor() + '">' + peer.getUsername() + '</li>');
  peer.userListItem = $('li[data-peer="' + peer.getSocketId() + '"]');
  peer.userListItem.click(function () {
    log('ask speaker to speak: ' + peer.getUsername());
    pipeUp.getSpeaker(peer);
  });
}
pipeUp.peers.onClosePeer = function (peer) {
  clientsList.find('li[data-peer="' + peer.getSocketId() + '"]').remove();
}

pipeUp.onChatMessageReceive = function (peer, msg) {
  log('Received message: ' + msg);
  var myself = (!peer) ? 'class="myself"' : '';
  if (peer) {
    chatContent.append('<p ' + myself + ' data-peer="' + peer.getSocketId() +
                '"><span class="' + peer.getPeerColor() + '">' +
                peer.getUsername() + ':</span> ' + msg + '</p>');
  } else {
    chatContent.append('<p class="myself"><span class="' + pipeUp.getHqSocketConf().color + '">' +
                pipeUp.getHqSocketConf().username + ':</span> ' + msg + '</p>');
  }

}

sendButton.click(function() {
  var msg = sendInput.val();
  pipeUp.peers.sendGlobalTxtMsg(msg);
  pipeUp.onChatMessageReceive(null, msg);
});

closeButton.click(function(e){
  pipeUp.close();
  location.reload();
});

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

