import React, { useEffect, useState } from 'react';
import * as guitestCallList from '../callstore';
import './../App.css';
import WebCall from 'telephony/src/webcall/webcall';

export function ReferNotifySipfragDisplay({ webTeletest }) {
  const [messages, setMessage] = useState([]);
  const [resetDisplay, setResetDisplay] = useState();

  // Destructor
  useEffect(() => {
    return () => {
      webTeletest.guiTest.lineDev?.removeEventListener('CallReferNotifySipfragEvent', (evt) => processIncMsg(evt));
      console.log("'ReferNotifySipfragDisplay': component did unmount !");
    };
  }, []);

  // When for telephony starts
  useEffect(() => {
    console.log("'ReferNotifySipfragDisplay': component started");
    webTeletest.guiTest.lineDev?.addEventListener('CallReferNotifySipfragEvent', (evt) => processIncMsg(evt));
  }, [webTeletest.state.telephonyStartStatus === 'Telephony Started']);

  // Called when GUI 'clearCallInfo' windows button is pressed
  useEffect(() => {
    console.log("'ReferNotifySipfragDisplay': reset GUI display");
    setMessage([]);
  }, [webTeletest.state.sipfragDisplayResetCnt]);


  const processIncMsg = async (e) => {
    let webCallId = e.call.webCallId;
    let sipCallId = e.call.sipId;
    let uci = e.uci;
    let chanName = e.chanName;
    let referResp = e.referResp;
    let notifySipfrag = e.sipfrag;
    let newLine = ''; 
    if (notifySipfrag)
      newLine = ` sipfrag: SIP REFER/NOTIFY sipfrag for webCallId<${webCallId}>: ${notifySipfrag}`;
    else
      newLine = ` sipfrag: SIP REFER response for webCallId<${webCallId}>: ${referResp}`;

    setMessage(prevArray => [...prevArray, newLine]);
    console.log(`%s`, newLine);
  };


  return (
    <>
      <div>{messages.map(e =>
        <div>{e}</div>)}
      </div>
    </>
  );
}
