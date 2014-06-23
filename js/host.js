"use strict";

// WebRTC Project for a better UX in Q&A sessions after presentations.
// No need for giving around a microphone anymore.

var sendButton =  $("#sendButton"),
    closeButton =  $("#closeButton"),
    txtInput =   $("#txtInput"),
    chatContent = $("#chatContent"),
    clientsList = $("#clients"),
    localVideo = document.querySelector('#localVideo'),
    remoteVideo = document.querySelector('#remoteVideo');

var pipeUp = new PipeUpHost();

pipeUp.onPeerAdded = function (peer) {
  trace('Send channel state is: open');

  //this.peers.refreshClientsListGlobal(clientsList.html());
}

pipeUp.peers.onListChanged = function () {
  var peers = this.getPeers(),
      html = '';

  enableMessageInterface(peers.length);
  clientsList.html(''); // clear

  for (var position in peers) {
    var peer = peers[position],
        conf = peer.getSocketConf(),
        pipedUp = '';

    if (peer.pipedUp)
      pipedUp = 'pipedUp '

    html += '<li data-peer="' + conf.socketId + '" class="' + pipedUp + conf.color + '">' + conf.username + '</li>';
    peer.userListItem = $('li[data-peer="' + conf.socketId + '"]');
    peer.userListItem.click(function () {
      log('ask speaker to speak: ' + conf.username);
      pipeUp.getSpeaker(peer);
    });
  }
  clientsList.append(html);
  // refreshing the clients list on the clients
  this.refreshClientsListGlobal(html);
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
  var msg = txtInput.val();
  pipeUp.peers.sendGlobalTxtMsg(msg);
  // to display msg in local message box
  pipeUp.onChatMessageReceive(null, msg);

  txtInput.val('');
});

closeButton.click(function(e) {
  pipeUp.close();
  location.reload();
});

txtInput.keyup(function(e) {
  if(e.keyCode == 13)  {
    sendButton.click();
  }
});

function enableMessageInterface(shouldEnable) {
  if (shouldEnable) {
    txtInput.removeAttr('disabled');
    txtInput.focus();
    txtInput.placeholder = "";
    sendButton.prop("disabled", false);
  } else {
    txtInput.attr('disabled', 'disabled');
    sendButton.prop("disabled", true);
  }
}


/////////////////////////////////////////////////////

