import React, { useEffect, useState } from 'react';
import * as guitestCallList from './../callstore';
import './../css/ListenJoinManagementBox.css';
import './../App.css';
import * as ExtInterface from 'telephony/src/telephonyexternalinterfacedef';
import { ISubsEventMsg } from 'telephony/src/webphone/interfaces/sip-subscribeNotify';
import { ListenJoinResponses, arrListenJoinResponses } from 'telephony/src/weblinedev/listenJoin';

export function ListenJoinManagementBox({ webTeletest }) {
  const [listenBtnOn, setListenBtnOn] = useState(false);
  const [joinBtnOn, setJoinBtnOn] = useState(false);
  const [position, setPosition] = useState('');
  const [modeEvt, setModeEvt] = useState('Off');
  const [monPosAgentEvt, setMonPosAgentEvt] = useState('');

  // Destructor
  useEffect(() => {
    return () => {
      webTeletest.guiTest.lineDev?.removeEventListener('ListenJoinChange', (evt) => processIncStatus(evt));
      console.log('[L&J GUI] ListenJoinManagementBox component did unmount');
    };
  }, []);

  // When for telephony to be created
  useEffect(() => {
    console.log('[L&J GUI] ListenJoin Management Box started');
    webTeletest.guiTest.lineDev?.addEventListener('ListenJoinChange', (evt) => processIncStatus(evt));
  }, [webTeletest.state.telephonyStartStatus === 'Telephony Started']);

  // Call each time the current call change
  useEffect(() => {}, [webTeletest.state.currentCallChange]);

  // Convert mode in string
  const setMode = async (mode) => {
    const strMode = ExtInterface.ljModeString(mode);
    setModeEvt(strMode);
  };

  // Process incoming status event
  const processIncStatus = async (e) => {
    if (e.mode === ExtInterface.ListenJoinMonitoringMode.Off) {
      console.log('[L&J GUI] Process incoming L&J event mode = OFF');
      setListenBtnOn(false);
      setJoinBtnOn(false);
    } else {
      const strMode = ExtInterface.ljModeString(e.mode);
      console.log('[L&J GUI] Process incoming L&J event mode = <%s> with Pos or AgentID = %s', strMode, e.posOrAgent);
    }

    setMode(e.mode);
    setMonPosAgentEvt(e.posOrAgent);
  };

  // Listen Toggle Button
  const ListenToggleButton = async () => {
    let inpPos = document.getElementById('inpPos').value;
    if (!position && !inpPos) {
      alert('No position or AgentID set.  Please note you MUST click <ENTER> if you change the position or AgentID ONLY !');
      return;
    }

    if (inpPos != position) {
      console.log(`[L&J GUI - Listen] Use new position or AgentID = ${inpPos}`);
      setPosition(inpPos);
    }

    if (listenBtnOn) {
      setListenBtnOn(false);
      try {
        const result = await webTeletest.guiTest.listenJoinCancel();
        console.log(`[L&J GUI - Listen] CANCEL ${result}`);
      } catch (error) {
        console.warn(`[L&J GUI - Listen] CANCEL Failed with error ${error}`);
      }
    } else if (!listenBtnOn && inpPos) {
      console.log(`[L&J GUI] Try to <listen> on position/agent ${inpPos}`);
      try {
        const successId = await webTeletest.guiTest.listenJoin(ExtInterface.ListenJoinMonitoringMode.Listen, inpPos);
        const strMsg = arrListenJoinResponses[successId].text;
        console.log(`[L&J GUI] listenJoin result = ${strMsg}`);
        if (joinBtnOn) setJoinBtnOn(false);
        setListenBtnOn(true);
      } catch (errorId) {
        const strMsg = arrListenJoinResponses[errorId].text;
        console.warn(`[L&J GUI] listenJoin error = ${strMsg}`);
      }
    }
  };

  // Join Toggle Button
  const JoinToggleButton = async () => {
    let inpPos = document.getElementById('inpPos').value;
    if (!position && !inpPos) {
      alert('No position or AgentID set.  Please note you MUST click <ENTER> if you change the position or AgentID ONLY !');
      return;
    }

    if (inpPos != position) {
      console.log(`[L&J GUI - Join] Use new position or AgentID = ${inpPos}`);
      setPosition(inpPos);
    }

    if (joinBtnOn) {
      setJoinBtnOn(false);
      try {
        const result = await webTeletest.guiTest.listenJoinCancel();
        console.log(`[L&J GUI - Join] CANCEL ${result}`);
      } catch (error) {
        console.warn(`[L&J GUI- Join] CANCEL Failed with error ${error}`);
      }
    } else if (!joinBtnOn && inpPos) {
      console.log(`[L&J GUI] Try to <join> position/agent ${inpPos}`);
      try {
        const successId = await webTeletest.guiTest.listenJoin(ExtInterface.ListenJoinMonitoringMode.Join, inpPos);
        const strMsg = arrListenJoinResponses[successId].text;
        console.log(`[L&J GUI] listenJoin result = ${strMsg}`);
        if (listenBtnOn) setListenBtnOn(false);
        setJoinBtnOn(true);
      } catch (errorId) {
        const strMsg = arrListenJoinResponses[errorId].text;
        console.warn(`[L&J GUI] listenJoin error = ${strMsg}`);
      }
    }
  };

  // Position DN or Agent change
  const onDestinationChange = async () => {
    let newPos = document.getElementById('inpPos').value;
    setPosition(newPos);
    try {
      let successId;
      if (joinBtnOn) {
        successId = await webTeletest.guiTest.listenJoin(ExtInterface.ListenJoinMonitoringMode.Join, newPos);
        const strMsg = arrListenJoinResponses[successId].text;
        console.log(
          `[L&J GUI] Continue in <Join> mode with a NEW Position or AgentID -> ${newPos}.  listenJoin result = ${strMsg}`
        );
      } else if (listenBtnOn) {
        successId = await webTeletest.guiTest.listenJoin(ExtInterface.ListenJoinMonitoringMode.Listen, newPos);
        const strMsg = arrListenJoinResponses[successId].text;
        console.log(
          `[L&J GUI] Continue in <Listen> mode with a NEW Position or AgentID -> ${newPos}.  listenJoin result = ${strMsg}`
        );
      }
    } catch (errorId) {
      const strMsg = arrListenJoinResponses[errorId].text;
      console.warn(`[L&J GUI] listenJoin error = ${strMsg}.  Position change did not occur !`);
    }
  };

  return (
    <>
      <div className="LJ-Window">
        <div className="LJ-Title">Listen and Join</div>
        <div>
          Position:{' '}
          <input
            className="LJ-MngPos"
            type="text"
            id="inpPos"
            onKeyPress={(event) => {
              if (event.key === 'Enter') {
                onDestinationChange();
              }
            }}
          />
          <button className={listenBtnOn ? 'LJ-TogOn' : 'LJ-TogOff'} onClick={ListenToggleButton}>
            Listen
          </button>
          <button className={joinBtnOn ? 'LJ-TogOn' : 'LJ-TogOff'} onClick={JoinToggleButton}>
            Join
          </button>
          <div>
            telephony event mode status:<span className="Highlight">{modeEvt}</span>
          </div>
          <div>
            telephony event monitoring position status:<span className="Highlight">{monPosAgentEvt}</span>
          </div>
        </div>
      </div>
    </>
  );
}
