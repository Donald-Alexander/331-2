import React, { useEffect, useState } from 'react';
import * as guitestCallList from './../callstore';
import './../css/RttManagementBox.css';
import './../App.css';
import WebCall from 'telephony/src/webcall/webcall';
import * as ExtInterface from 'telephony/src/telephonyexternalinterfacedef';

export function RttManagementBox({ webTeletest }) {
  const [localRttGuiCntUpd, setLocalRttGuiCntUpd] = useState(0);
  const [msgRttTranscript, setMsgRttTranscript] = useState(['']);
  // Destructor
  useEffect(() => {
    return () => {
      webTeletest.guiTest.lineDev?.removeEventListener('RttMessageEvent', (evt) => processIncMsg(evt));
      webTeletest.guiTest.lineDev?.removeEventListener('OutRttMessageEvent', (evt) => processOutMsg(evt));
      webTeletest.guiTest.lineDev?.removeEventListener('RttMediaStatusEvent', (evt) => processRttStatus(evt));
      console.log("'RttManagementBox' component did unmount !");
    };
  }, []);

  // When for telephony to be created
  useEffect(() => {
    console.log('Rtt Management Box started');
    webTeletest.guiTest.lineDev?.addEventListener('RttMessageEvent', (evt) => processIncMsg(evt));
    webTeletest.guiTest.lineDev?.addEventListener('OutRttMessageEvent', (evt) => processOutMsg(evt));
    webTeletest.guiTest.lineDev?.addEventListener('RttMediaStatusEvent', (evt) => processRttStatus(evt));
  }, [webTeletest.state.telephonyStartStatus === 'Telephony Started']);

  // Call each time the current call change
  useEffect(() => {
    let currentRttGuiCntUpd = webTeletest.state.rttGuiCntUpd;
    if (currentRttGuiCntUpd !== localRttGuiCntUpd) {
      console.log('WebTeletest RTT refresh display counter changed(%d vs. %d)', currentRttGuiCntUpd, localRttGuiCntUpd);
      setLocalRttGuiCntUpd(currentRttGuiCntUpd);
      let call = guitestCallList.getCurrentCall();
      if (call) {
        setupRttTranscript(call);
      }
    }
  }, [webTeletest.state.rttGuiCntUpd]);

  const processIncMsg = async (e) => {
    console.log('Process incoming RTT message = %s for SIPCallID = %s', e.receivedText, e.call.sipId);
    var today = new Date();
    var time = today.getHours().toString().padStart(2, '0') + ":" + today.getMinutes().toString().padStart(2, '0') + ":" + today.getSeconds().toString().padStart(2, '0');
    let senderInfo = e.senderInfo;
    let sequenceNumber = e.sequenceNumber;
    let receivedText = e.receivedText;
    let taggedMsg = '[' + time + '] ' + senderInfo + ': ' + receivedText /*+ "<br />"*/;
    e.call.addRttMsg(taggedMsg);

    let currentCall = guitestCallList.getCurrentCall();
    if (currentCall.sipId === e.call.sipId) {
      await setupRttTranscript(e.call);
      const outputElem = document.getElementById('rttoutput');
      outputElem.scrollTop = outputElem.scrollHeight - outputElem.clientHeight;
      }
  };

  const processOutMsg = async (e) => {
    console.log('Process outgoing RTT message = %s for SIPCallID = %s', e.receivedText, e.call.sipId);
    var today = new Date();
    var time = today.getHours().toString().padStart(2, '0') + ":" + today.getMinutes().toString().padStart(2, '0') + ":" + today.getSeconds().toString().padStart(2, '0');
    let senderInfo = e.senderInfo;
    let sequenceNumber = e.sequenceNumber;
    let sentText = e.sentText;
    let taggedMsg = '[' + time + '] ' + senderInfo + ': ' + sentText /*+ "<br />"*/;
    e.call.addRttMsg(taggedMsg);

    let currentCall = guitestCallList.getCurrentCall();
    if (currentCall.sipId === e.call.sipId) {
      await setupRttTranscript(e.call);
      const outputElem = document.getElementById('rttoutput');
      outputElem.scrollTop = outputElem.scrollHeight - outputElem.clientHeight;
      }
  };

  const processRttStatus = async (e) => {
    console.log('Process RTT Status = %s for ID = %s', e.status, e.webCall.sipId);
    if (e.status === ExtInterface.RttMediaStatus.RttMediaConnected)
    {
      // send initial message after RTT media is connected
      e.webCall.rttSend("Greetings Question");
    }
  };

  const onSendMsg = async () => {
    let val = document.getElementById('inpRttTxMsg').value;
    webTeletest.rttSend(val);
    // Clear the TX field
    document.getElementById('inpRttTxMsg').value = '';
  };

  const setupRttTranscript = async (call) => {
    let transcript;
    if (call.infoRec.subject) {
      transcript = '[[InviteSubject]]' + call.infoRec.subject + '\n' + call.getRttTranscript();
    }
    else {
      transcript = call.getRttTranscript();
    }
    //console.log("RTT (transcript):"+transcript[0]+transcript[1]);
    //transcript = ["BON", "NON", "OUI"];
    //setMsgRttTranscript(transcript);
    setMsgRttTranscript([...transcript]);
    //console.log("RTT (msgRttTranscript): "+ msgRttTranscript[0]+msgRttTranscript[1]);
  };



return (
    <>
      <div className="Rtt-Window">
        <div className="Rtt-Title">RTT Management</div>

        <div className="Rtt-BoldText">
          Transcript:
          <div className="Rtt-Transcript" id="rttoutput">
            {msgRttTranscript.map(e =>
            <div>{e}</div>)}
          </div>
        </div>

        <div className="Rtt-BoldText">
          {' '}
          TX:
          <div className="Rtt-SendBox">
            <input
              className="Rtt-Tx"
              type="text"
              id="inpRttTxMsg"
              onKeyPress={(event) => {
                if (event.key === 'Enter') {
                  onSendMsg();
                }
              }}
              onKeyDown={(event) => {
                if (event.charCode === 8) {
                  console.log('RTT: backspace entered\n');
                }
                else
                {
                  console.log('RTT: %d\n', event.keyCode);
                }
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
