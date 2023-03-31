import React, { useEffect } from 'react';
import './../css/ItrrManagementBox.css';
import './../App.css';

export function ItrrManagementBox({ webTeletest }) {
  // Called only once when the component load.  Simulate a constructor !
  useEffect(() => {
    console.log('Itrr Management Box started');
    document.getElementById('ContRec').checked = true;
    document.getElementById('exportFilename').value = 'export.wav';
  }, []);

  const onOpen = async (e) => {
    if (document.getElementById('ContRec').checked) {
      webTeletest.itrrOpen('ContRec');
    } else if (document.getElementById('Conversation').checked) {
      let select = document.getElementById('fileSelection');
      webTeletest.itrrOpen(select.selectedOptions[0].outerText);
    } else if (document.getElementById('Export').checked) {
      let select = document.getElementById('exportSelection');
      webTeletest.itrrOpen(select.selectedOptions[0].outerText, true);
    }
  };

  const onClose = async (e) => {
    webTeletest.itrrClose();
  };

  const onPlay = async (e) => {
    webTeletest.itrrPlay();
  };

  const onStop = async (e) => {
    webTeletest.itrrStop();
  };

  const onPause = async (e) => {
    webTeletest.itrrPause();
  };

  const onResume = async (e) => {
    webTeletest.itrrResume();
  };

  const onSeekPlus = async (e) => {
    webTeletest.itrrSeek(true);
  };

  const onSeekMinus = async (e) => {
    webTeletest.itrrSeek(false);
  };

  const onSetSpeed = async (e) => {
    let select = document.getElementById('speedSelection');
    webTeletest.itrrSetSpeed(parseInt(select.selectedOptions[0].value));
  };

  const onSetSelection = async (e) => {
    let select = document.getElementById('convSelection');
    webTeletest.itrrSetSelection(select.selectedOptions[0].outerText);
  };

  const onExport = async (e) => {
    let startTime = document.getElementById('startTime');
    let start = new Date(startTime.value);
    let endTime = document.getElementById('endTime');
    let end = new Date(endTime.value);
    let exportFilename = document.getElementById('exportFilename');
    let filename = exportFilename.value;
    webTeletest.itrrExport(start, end, filename);
  };

  const onSave = async (e) => {
    let select = document.getElementById('convSelection');
    webTeletest.itrrSave(select.selectedOptions[0].outerText);
  };

  const onUnsave = async (e) => {
    if (document.getElementById('Conversation').checked) {
      let select = document.getElementById('fileSelection');
      webTeletest.itrrUnsave(select.selectedOptions[0].outerText);
    } else if (document.getElementById('Export').checked) {
      let select = document.getElementById('exportSelection');
      webTeletest.itrrDelete(select.selectedOptions[0].outerText);
    }
  };

  const onExportConv = async (e) => {
    let select = document.getElementById('convSelection');
    webTeletest.itrrExportConv(select.selectedOptions[0].outerText);
  };

  const onTelVolChange = async (event) => {
    webTeletest.itrrSetVolume(true, event.target.value);
  };

  const onRadioVolChange = async (event) => {
    webTeletest.itrrSetVolume(false, event.target.value);
  };

  return (
    <>
      <div className="itrr-window">
        <div className="title">ITRR Management</div>
        <div>
          <div className="CtiBoldText">Files</div>
          <div class="led-boxPanel">
            <div>
              <input type="radio" id="ContRec" name="FileType" value="ContRec" />
              <label for="ContRec">ContRec</label>
              <br />
              <input type="radio" id="Conversation" name="FileType" value="Conversation" />
              <select class="sel" name="fileSelection" id="fileSelection">
                {webTeletest.state.itrrSavedFile.map((ctxId, i) => (
                  <option key={ctxId}>{ctxId}</option>
                ))}
              </select>
              <br />
              <input type="radio" id="Export" name="FileType" value="Export" />
              <select class="sel" name="exportSelection" id="exportSelection">
                {webTeletest.state.itrrExportFile.map((fileName, i) => (
                  <option key={fileName}>{fileName}</option>
                ))}
              </select>
              <br />
            </div>
            <div>
              <button className="button" onClick={(e) => onOpen(e)}>
                Open
              </button>
              <button className="button" onClick={(e) => onClose(e)}>
                Close
              </button>
              <button className="button" onClick={(e) => onUnsave(e)}>
                Unsave
              </button>
            </div>
            <div>
              Opened File:
              <span className="Highlight">
                {webTeletest.state.ItrrOpenFile === ''
                  ? 'None'
                  : webTeletest.state.itrrOpenFile + ' [' + webTeletest.state.itrrOpenFileIndex + ']'}
              </span>
            </div>
          </div>
          <div className="CtiBoldText">Conversations</div>
          <div class="led-boxPanel">
            <select class="sel" name="convSelection" id="convSelection">
              {webTeletest.state.itrrFileConversation.map((conv) => (
                <option key={conv.sectionInfo.ctxId}>{conv.sectionInfo.ctxId}</option>
              ))}
            </select>
            <div>
              <button className="button" onClick={(e) => onSetSelection(e)}>
                Select
              </button>
              <button className="button" onClick={(e) => onSave(e)}>
                Save
              </button>
              <button className="button" onClick={(e) => onExportConv(e)}>
                Export
              </button>
            </div>
          </div>
          <div className="CtiBoldText">Section</div>
          <div class="led-boxPanel">
            <div class="sectionInfo">
              Context-ID:
              {webTeletest.state.itrrSelSection ? webTeletest.state.itrrSelSection.sectionInfo.ctxId : '-------'}
              <br />
              Call-ID:{' '}
              {webTeletest.state.itrrSelSection ? webTeletest.state.itrrSelSection.sectionInfo.callId : '-------'}
              <br />
              Direction:
              {webTeletest.state.itrrSelSection ? webTeletest.state.itrrSelSection.sectionInfo.direction : '-------'}
              <br />
              Phone Number:
              {webTeletest.state.itrrSelSection && webTeletest.state.itrrSelSection.sectionInfo.phoneNumber !== ''
                ? webTeletest.state.itrrSelSection.sectionInfo.phoneNumber
                : '-------'}
              <br />
              Start time:
              <span>
                {webTeletest.state.itrrSelSection && webTeletest.state.itrrSelSection.startTime.getTime() !== 0
                  ? webTeletest.state.itrrSelSection.startTime.toString().split('GMT')[0]
                  : '-------'}
              </span>
              <br />
              End time:
              <span>
                {webTeletest.state.itrrSelSection && webTeletest.state.itrrSelSection.endTime.getTime() !== 0
                  ? webTeletest.state.itrrSelSection.endTime.toString().split('GMT')[0]
                  : '-------'}
              </span>
            </div>
          </div>
          <div className="CtiBoldText">Playback</div>
          <div class="led-boxPanel">
            <div className="ButtonPanel1">
              <button className="button" onClick={(e) => onPlay(e)}>
                Play
              </button>
              <button className="button" onClick={(e) => onStop(e)}>
                Stop
              </button>
              <button className="button" onClick={(e) => onPause(e)}>
                Pause
              </button>
              <button className="button" onClick={(e) => onResume(e)}>
                Resume
              </button>
              <button className="button" onClick={(e) => onSeekPlus(e)}>
                Seek +5s
              </button>
              <button className="button" onClick={(e) => onSeekMinus(e)}>
                Seek -5s
              </button>
            </div>
            <div>
              Speed:<span className="Highlight">{webTeletest.state.itrrSpeed}</span>
              <select name="speedSelection" id="speedSelection">
                <option value="50">1/2x</option>
                <option value="100"> 1x</option>
                <option value="200"> 2x</option>
              </select>
              <button className="button" onClick={(e) => onSetSpeed(e)}>
                Set Speed
              </button>
            </div>
            <div>
              Status:
              <span className="Highlight">
                {webTeletest.state.itrrPlaybackType !== '' ? webTeletest.state.itrrPlaybackType : '-------'}
              </span>
              <br />
              Time:
              <span className="Highlight">
                {webTeletest.state.itrrPlaybackTime.getTime() !== 0
                  ? webTeletest.state.itrrPlaybackTime.toString().split('GMT')[0]
                  : '-------'}
              </span>
            </div>
          </div>
          <div className="CtiBoldText">Volume</div>
          <div class="led-boxPanel">
            <div>
              Telephony volume:
              <input
                type="range"
                min="0"
                max="10"
                value={webTeletest.state.itrrTelephonyVolume}
                onChange={(e) => onTelVolChange(e)}
              />
            </div>
            <div>
              Radio volume:
              <input
                type="range"
                min="0"
                max="10"
                value={webTeletest.state.itrrRadioVolume}
                onChange={(e) => onRadioVolChange(e)}
              />
            </div>
          </div>
          <div className="CtiBoldText">Export</div>
          <div class="led-boxPanel">
            <div>
              Start time: <input type="datetime-local" id="startTime" name="startTime"></input>
              <br />
              End time: <input type="datetime-local" id="endTime" name="endTime"></input>
              <br />
              File name: <input type="text" id="exportFilename" name="exportFilename"></input>
              <br />
            </div>
            <div className="ButtonPanel1">
              <button className="button" onClick={(e) => onExport(e)}>
                Export
              </button>
            </div>
          </div>
          ITRR Hostname:<span className="Highlight">{webTeletest.state.itrrHostname}</span>
          <br />
          ITRR Status:<span className="Highlight">{webTeletest.state.itrrStatus}</span>
        </div>
      </div>
    </>
  );
}
