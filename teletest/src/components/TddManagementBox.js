import React, { useEffect } from 'react';
import './../css/TddManagementBox.css';
import './../App.css';

export function TddManagementBox({ webTeletest }) {
  // Called only once when the component load.  Simulate a constructor !
  useEffect(() => {
    console.log('Tdd Management Box started');
  }, []);

  const onConnect = async (e) => {
    webTeletest.tddConnect();
  };

  const onDisconnect = async (e) => {
    webTeletest.tddDisconnect();
  };

  const onVCO = async (e) => {
    webTeletest.vco();
  };

  const onHCO = async (e) => {
    webTeletest.hco();
  };

  const onSend = async (e) => {
    webTeletest.tddSendTranscript();
  };

  const onKeyDown = async (e) => {
    if (e.keyCode == 13) {
      webTeletest.tddSend(document.getElementById('TxText').value + String.fromCharCode(10));
      // Clear the TX field
      document.getElementById('TxText').value = '';
    }
  };

  const onAbortTx = async (e) => {
    webTeletest.abortTx();
  };

  const onClearData = async (e) => {
    webTeletest.setState({ tddRxConversation: '' });
    webTeletest.setState({ tddTxConversation: '' });
  };

  return (
    <>
      <div className="tdd-window">
        <div className="title">TTY Management</div>

        <div className="BoldText">
          RX:
          <div className="TddLog">
            <div>{webTeletest.state.tddRxConversation}</div>
          </div>
        </div>

        <div className="BoldText">
          TX: <input type="text" id="TxText" onKeyDown={(e) => onKeyDown(e)} />
          <button className="Button" onClick={(e) => onAbortTx(e)}>
            AbortTx
          </button>
          <div className="TddLog">
            <div>{webTeletest.state.tddTxConversation}</div>
          </div>
        </div>

        <div>
          <div className="ButtonPanel1">
            <button className="Button" onClick={(e) => onConnect(e)}>
              Connect
            </button>
            <button className="Button" onClick={(e) => onDisconnect(e)}>
              Disconnect
            </button>
            <button className="Button" onClick={(e) => onSend(e)}>
              Send Transcript
            </button>
            <button className="Button" onClick={(e) => onClearData(e)}>
              Clear Data
            </button>
            <button className="Button" onClick={(e) => onHCO(e)}>
              {webTeletest.state.hco ? 'HCO: On' : 'HCO: Off'}
            </button>
            <button className="Button" onClick={(e) => onVCO(e)}>
              {webTeletest.state.vco ? 'VCO: On' : 'VCO: Off'}
            </button>
          </div>
          TDD Link:<span className="Highlight">{webTeletest.state.tddLink ? 'Up' : 'Down'}</span>
          Connected:<span className="Highlight">{webTeletest.state.tddConnection ? 'On' : 'Off'}</span>
          Detected:<span className="Highlight">{webTeletest.state.tddDetection ? 'On' : 'Off'}</span>
        </div>
      </div>
    </>
  );
}
