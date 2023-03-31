import React, { useEffect, useState } from 'react';
import * as guitestCallList from './../callstore';
import './../css/MsrpManagementBox.css';
import './../App.css';
import WebCall from 'telephony/src/webcall/webcall';

export function MsrpManagementBox({ webTeletest }) {
  const [localMsrpGuiCntUpd, setLocalMsrpGuiCntUpd] = useState(0);
  const [msgTranscript, setMsgTranscript] = useState(['']);

  // Destructor
  useEffect(() => {
    return () => {
      webTeletest.guiTest.lineDev?.removeEventListener('MsrpMessageEvent', (evt) => processIncMsg(evt));
      console.log("'MsrpManagementBox' component did unmount !");
    };
  }, []);

  // When for telephony to be created
  useEffect(() => {
    console.log('Msrp Management Box started');
    webTeletest.guiTest.lineDev?.addEventListener('MsrpMessageEvent', (evt) => processIncMsg(evt));
  }, [webTeletest.state.telephonyStartStatus === 'Telephony Started']);

  // Call each time the current call change
  useEffect(() => {
    let currentMsrpGuiCntUpd = webTeletest.state.msrpGuiCntUpd;
    if (currentMsrpGuiCntUpd !== localMsrpGuiCntUpd) {
      console.log('WebTeletest MSRP refresh display counter changed(%d vs. %d)', currentMsrpGuiCntUpd, localMsrpGuiCntUpd);
      setLocalMsrpGuiCntUpd(currentMsrpGuiCntUpd);
      let call = guitestCallList.getCurrentCall();
      if (call) {
        setupMsrpTranscript(call);
      }
    }
  }, [webTeletest.state.msrpGuiCntUpd]);

  const processIncMsg = async (e) => {
    console.log('Process incoming MSRP message = %s for SIPCallID = %s', e.message, e.call.sipId);
    let senderInfo = e.senderInfo;
    let sequenceNumber = e.sequenceNumber;
    let receivedText = e.receivedText;
    let taggedMsg = '[[' + sequenceNumber + '@' + senderInfo + ']]' + receivedText;
    e.call.addMsrpMsg(taggedMsg);

    let currentCall = guitestCallList.getCurrentCall();
    if (currentCall.sipId === e.call.sipId) {
      setupMsrpTranscript(e.call);
    }
  };

  const onSendMsg = async () => {
    let val = document.getElementById('inpTxMsg').value;
    webTeletest.msrpSend(val);
    // Clear the TX field
    document.getElementById('inpTxMsg').value = '';
  };

  const onTake = async () => {
    let call = guitestCallList.getCurrentCall();
    if (call) {
      try {
        call.takeTextOwnership();
      } catch (e) {
        console.dir(e);
      }
    }
  };

  const setupMsrpTranscript = async (call) => {
    let transcript = call.getMsrpTranscript();
    if (call.infoRec.subject && transcript.length === 0) {
      let subject = '[[InviteSubject]]' + call.infoRec.subject;
      call.addMsrpMsg(subject);
    }
    setMsgTranscript([...transcript]);
  }

  return (
    <>
      <div className="Msrp-Window">
        <div className="Msrp-Title">MSRP Management</div>

        <div className="Msrp-BoldText">
          Transcript:
          <div className="Msrp-Transcript">
            {msgTranscript.map(e =>
            <div>{e}</div>)}
          </div>
        </div>

        <div className="Msrp-BoldText">
          {' '}
          TX:
          <div className="Msrp-SendBox">
            <input
              className="Msrp-Tx"
              type="text"
              id="inpTxMsg"
              onKeyPress={(event) => {
                if (event.key === 'Enter') {
                  onSendMsg();
                }
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
