import React, { useEffect } from 'react';
import './../css/CtiHardwareBox.css';
import './../App.css';

export function CtiHardwareBox({ webTeletest }) {
  // Called only once when the component load.  Simulate a constructor !
  useEffect(() => {
    console.log('Cti Hardware Management Box started');
  }, []);

  const onHandset1Mute = async (e) => {
    webTeletest.handset1Mute();
  };

  const onHandset2Mute = async (e) => {
    webTeletest.handset2Mute();
  };

  const onPtt = async (e) => {
    webTeletest.ptt();
  };

  const onSplitCombine = async (e) => {
    webTeletest.splitCombine();
  };

  const onAgcTx = async (e) => {
    webTeletest.agcTx();
  };

  const onAgcRx = async (e) => {
    webTeletest.agcRx();
  };

  const onNrRx = async (e) => {
    webTeletest.nrRx();
  };

  const onDialTone = async (e) => {
    const checked = e.target.checked;
    webTeletest.dialTone(checked);
  };

  const onRingTone = async (e) => {
    const checked = e.target.checked;
    webTeletest.ringTone(checked);
  };

  const onReorderTone = async (e) => {
    const checked = e.target.checked;
    webTeletest.reorderTone(checked);
  };

  const onBusyTone = async (e) => {
    const checked = e.target.checked;
    webTeletest.busyTone(checked);
  };

  const onBeep = async (e) => {
    var e = document.getElementById('beepSelection');
    webTeletest.beep(e.value);
  };

  return (
    <>
      <div className="ctihardware-window">
        <div className="CtiTitle">CTI Hardware</div>

        <div className="row">
          <div className="column">
            <div className="CtiBoldText">Handsets</div>
            <div class="led-boxPanel">
              <div class="led-box">
                <div
                  className={
                    !webTeletest.state.handsetsAvailable
                      ? 'led-grey'
                      : webTeletest.state.handsetsPresent
                      ? 'led-green'
                      : 'led-red'
                  }
                />
                <p>Present</p>
              </div>
            </div>
          </div>
          <div className="column">
            <div className="CtiBoldText">Handset 1</div>
            <div class="led-boxPanel">
              <div class="led-box">
                <div
                  className={
                    !webTeletest.state.handsetsAvailable
                      ? 'led-grey'
                      : webTeletest.state.handset1MuteTx
                      ? 'led-green'
                      : 'led-red'
                  }
                />
                <button onClick={(e) => onHandset1Mute(e)}>Mute</button>
              </div>
            </div>
          </div>

          <div className="column">
            <div className="CtiBoldText">Handset 2</div>
            <div class="led-boxPanel">
              <div class="led-box">
                <div
                  className={
                    !webTeletest.state.handsetsAvailable
                      ? 'led-grey'
                      : webTeletest.state.handset2MuteTx
                      ? 'led-green'
                      : 'led-red'
                  }
                />
                <button onClick={(e) => onHandset2Mute(e)}>Mute</button>
              </div>
            </div>
          </div>
        </div>

        <div className="CtiBoldText">Radio</div>
        <div class="led-boxPanel">
          <div class="led-box">
            <div
              className={
                !webTeletest.state.radioAvailable ? 'led-grey' : webTeletest.state.radioPttTx ? 'led-green' : 'led-red'
              }
            />
            <button onClick={(e) => onPtt(e)}>PTT</button>
          </div>
          <div class="led-box">
            <div
              className={
                !webTeletest.state.radioAvailable ? 'led-grey' : webTeletest.state.radioPttRx ? 'led-green' : 'led-red'
              }
            />
            <p>Radio Rx</p>
          </div>
          <div class="led-box">
            <div
              className={
                !webTeletest.state.radioAvailable
                  ? 'led-grey'
                  : webTeletest.state.radioModeSplit
                  ? 'led-red'
                  : 'led-green'
              }
            />
            <button onClick={(e) => onSplitCombine(e)}>{webTeletest.state.radioModeSplit ? 'Combine' : 'Split'}</button>
          </div>
        </div>

        <div className="CtiBoldText">Audio Processing</div>
        <div class="led-boxPanel">
          <div class="led-box">
            <div
              className={
                !webTeletest.state.agcTxAvailable ? 'led-grey' : webTeletest.state.agcTxStatus ? 'led-green' : 'led-red'
              }
            />
            <button onClick={(e) => onAgcTx(e)}>AGC Tx</button>
          </div>
          <div class="led-box">
            <div
              className={
                !webTeletest.state.agcRxAvailable ? 'led-grey' : webTeletest.state.agcRxStatus ? 'led-green' : 'led-red'
              }
            />
            <button onClick={(e) => onAgcRx(e)}>AGC Rx</button>
          </div>
          <div class="led-box">
            <div
              className={
                !webTeletest.state.nrRxAvailable ? 'led-grey' : webTeletest.state.nrRxStatus ? 'led-green' : 'led-red'
              }
            />
            <button onClick={(e) => onNrRx(e)}>NR Rx</button>
          </div>
        </div>

        <div className="CtiBoldText">Progress Tones</div>
        <div class="led-boxPanel">
          <div class="led-box">
            <p>Dial</p>
            <input type="checkbox" checked={webTeletest.state.chkDialTone} onChange={(e) => onDialTone(e)} />
          </div>
          <div class="led-box">
            <p>Busy</p>
            <input type="checkbox" checked={webTeletest.state.chkBusyTone} onChange={(e) => onBusyTone(e)} />
          </div>
          <div class="led-box">
            <p>Reorder</p>
            <input type="checkbox" checked={webTeletest.state.chkReorderTone} onChange={(e) => onReorderTone(e)} />
          </div>
          <div class="led-box">
            <p>Ringback</p>
            <input type="checkbox" checked={webTeletest.state.chkRingTone} onChange={(e) => onRingTone(e)} />
          </div>
        </div>

        <div className="CtiBoldText">Beep</div>
        <div class="led-boxPanel">
          <div class="led-box">
            <select name="beepSelection" id="beepSelection">
              <option value="abandon" selected>
                Abandon
              </option>
              <option value="alarm">Alarm</option>
              <option value="broadcast">Broadcast</option>
              <option value="incident">Incident</option>
              <option value="newText">New Text</option>
              <option value="ttyValidate">TTY Validate</option>
            </select>
            <button onClick={(e) => onBeep(e)}>Beep</button>
          </div>
        </div>
      </div>
    </>
  );
}
