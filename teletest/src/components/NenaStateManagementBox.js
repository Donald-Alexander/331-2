import React from 'react';
import './../css/NenaStateManagementBox.css';
import './../App.css';

export function NenaStateManagementBox({ webTeletest }) {
  return (
    <>
      <div className="nena-state-box">
        <div className="title">Nena State</div>

        <div>
          Output:
          <div className="nena-state-data">
            <div>{webTeletest.state.nenaStateData}</div>
          </div>
        </div>

        <div>
          <div>Identifier: <input type="text" id="nenaIdentifier" onChange={(e) => webTeletest.setState({nenaIdentifier: e.target.value})} /></div>
          <div>Override: <input type="text" id="nenaOverride" onChange={(e) => webTeletest.setState({nenaOverride: e.target.value})} /></div>
          <div>Reason: <input type="text" className="nena-reason" id="nenaReason" onChange={(e) => webTeletest.setState({nenaReason: e.target.value})} /></div>
        </div>

        <div>
        QueueState:
        <div className="ButtonPanel1">
            <button className="button" onClick={() => webTeletest.nenaQueueStateGet(webTeletest.state.nenaIdentifier)}>
              Get
            </button>
            <button className="button" onClick={() => webTeletest.nenaQueueStateGetAll()}>
              GetAll
            </button>
            <button className="button" onClick={() => webTeletest.nenaQueueStateSetOverride(webTeletest.state.nenaIdentifier, webTeletest.state.nenaOverride, webTeletest.state.nenaReason)}>
              SetOverride
            </button>
            <button className="button" onClick={() => webTeletest.nenaQueueStateClearOverride(webTeletest.state.nenaIdentifier)}>
              ClearOverride
            </button>
          </div>
          ServiceState:
          <div className="ButtonPanel1">
            <button className="button" onClick={() => webTeletest.nenaServiceStateGet(webTeletest.state.nenaIdentifier)}>
              Get
            </button>
            <button className="button" onClick={() => webTeletest.nenaServiceStateGetAll()}>
             GetAll
            </button>
            <button className="button" onClick={() => webTeletest.nenaServiceStateSetOverride(webTeletest.state.nenaIdentifier, webTeletest.state.nenaOverride, webTeletest.state.nenaReason)}>
             SetOverride
            </button>
            <button className="button" onClick={() =>webTeletest.nenaServiceStateClearOverride(webTeletest.state.nenaIdentifier)}>
              ClearOverride
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
