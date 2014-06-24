"use strict";

// WebRTC Project for a better UX in Q&A sessions after presentations.
// No need for giving around a microphone anymore.

var sendButton =  $("#sendButton"),
    speakButton = $('#speak'),
    stopButton = $('#stop'),
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
  }
  clientsList.append(html);


  $('ul#clients li').click(function () {
    $('ul#clients li').removeClass('selected');
    $(this).toggleClass('selected');
    changeUser($(this).data('peer'));
  });


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

function changeUser(socketId) {
  if (socketId) {
    $('#remote #controls .name').html(pipeUp.peers.getPeer(socketId).getUsername());
    speakButton.data('peer', socketId);
    stopButton.data('peer', socketId);
    $('#remote').css('visibility', 'visible');
  } else {
    $('#remote').css('visibility', 'hidden');
  }
}

speakButton.click(function() {
  var socketId = $('#speak').data('peer');

  $(this).prop("disabled", true);
  stopButton.prop("disabled", false);

  log('ask speaker to speak: ' + socketId);
  pipeUp.peers.getPeer(socketId).sendAction('getVideoAudio');

});

stopButton.click(function() {
  var socketId = $('#stop').data('peer');

  $(this).prop("disabled", true);
  speakButton.prop("disabled", false);

  pipeUp.peers.getPeer(socketId).sendAction('stopVideoAudio');
  log('stop speaker: ' + socketId);
});



/////////////////////////////////////////////////////

