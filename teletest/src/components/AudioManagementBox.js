import React, {useRef, useEffect, useState} from "react";
import Select from "react-select";
import "./../css/AudioManagementBox.css";

const SELECT_OPTIONS_EXAMPLE = [
  { value: 'default', label: 'The Default' },
  { value: 'device 1', label: 'The Device 1' },
  { value: 'device 2', label: 'The Device 2' }
];


export function AudioManagementBox({webTeletest}) {

  const [inVol, setInVol] = useState("");
  const [inVolPrevious, setInVolPrevious] = useState("");
  const [outVol, setOutVol] = useState("");
  const [outVolPrevious, setOutVolPrevious] = useState("");
  const [inputSelection, setIntputSelection] = useState({});
  const [outputSelection, setOutputSelection] = useState({label:"", value:""});
  const [inputSelectionList, setIntputSelectionList] = useState([]);
  const [outputSelectionList, setOutputSelectionList] = useState([]);

  // console.log('TelephonyToggleButton component rendering....');

  // Called only once when the component load.  Simulate a constructor !
  useEffect(() => {
    console.log('Audio Management Box started');
    webTeletest.guiTest.registerInputDevicesCb(inputDevicesCb);
    webTeletest.guiTest.registerOutputDevicesCb(outputDevicesCb);
    setInVol("10");
    setOutVol("10");
  }, [webTeletest.state.telephonyStartStatus === "Telephony Started"]);

  // Called each time there is HARDWARE media input device changes
  const updateInputOptions = async (devices) => {
    let inputSelectionInitialzed = false;
    setIntputSelectionList([]);
    for (let index of devices) {
      try {
        const data = {
          value: index.id,
          label: index.name,
        };
        setIntputSelectionList(prevArray => [...prevArray, data]);
        // Always use the first device for initialization
        if (!inputSelectionInitialzed) {
          setIntputSelection(data);
          webTeletest.guiTest.changeInputDevSelection(data);
          inputSelectionInitialzed = true;
        }
      } catch (error) {
        console.error('[react] Failed filling input options');
      }
    }
  };

  // Called each time there is HARDWARE media output device changes
  const updateOutputOptions = async (devices) => {
    let outputSelectionInitialzed = false;
    setOutputSelectionList([]);
    for (let index of devices) {
      try {
        const data = {
          value: index.id,
          label: index.name,
        };
        setOutputSelectionList(prevArray => [...prevArray, data]);
        // Always use the first device for initialization
        if (!outputSelectionInitialzed) {
          setOutputSelection(data);
          webTeletest.guiTest.changeOutputDevSelection(data);
          outputSelectionInitialzed = true;
        }
      } catch (error) {
        console.error('[react] Failed filling output options');
      }
    }
  };
  
  const inputDevicesCb = async (devices) => {
    updateInputOptions(devices);
    console.log("### inputDevicesCb ###")
  }

  const outputDevicesCb = async (devices) => {
    updateOutputOptions(devices);
    console.log("### outputDevicesCb ###")
  }

  const inVolChange = async (event) => {
    setInVol(event.target.value);
    webTeletest.guiTest.changeInputVolume(event.target.value);
  }

  const inMuteChange = async (event) => {
    const checked = event.target.checked;
    if (checked) {
      setInVolPrevious(inVol);
      setInVol("0");
      webTeletest.guiTest.changeInputMuted(true);
    }
    else {
      setInVol(inVolPrevious);
      webTeletest.guiTest.changeInputMuted(false);
    }
  }

  const outVolChange = async (e) => {
    setOutVol(e.target.value);
    webTeletest.guiTest.changeOutputVolume(e.target.value);
  }

  const outMuteChange = async (e) => {
    const checked = e.target.checked;
    if (checked) {
      setOutVolPrevious(outVol);
      setOutVol("0");
      webTeletest.guiTest.changeOutputMuted(true);
    }
    else {
      setOutVol(outVolPrevious);
      webTeletest.guiTest.changeOutputMuted(false);
    }
  }

  const handleInSelect = async (e) => {
    setIntputSelection(e);
    webTeletest.guiTest.changeInputDevSelection(e);
  }

  const handleOutSelect = async (e) => {
    setOutputSelection(e);
    webTeletest.guiTest.changeOutputDevSelection(e);
  }

  const playTestTone = async (e) => {
    var selection = outputSelection.value;
    const volume = parseInt(outVol)
    webTeletest.guiTest.playTestTone({selection, volume});
  }


  return (
    <>
    <div className="audio-window">
      <div className="title">
        Audio Management
      </div>
      <div className="RangeBar">
        Input volume:
        <input type="range" min="0" max="10" value={inVol} onChange={(e) => inVolChange(e)}/>
        Mute: 
        <input type="checkbox" onChange={(e) => inMuteChange(e)}/>
      </div>
      <div className="RangeBar">
        Output volume:
        <input type="range" min="0" max="10" value={outVol} onChange={(e) => outVolChange(e)}/>
        Mute:
        <input type="checkbox" onChange={(e) => outMuteChange(e)}/>
      </div>
      <h4 className="Devices">Devices</h4>
      <div>
        <div>
          Input:
          <Select multi={false} value={inputSelection} options={inputSelectionList} onChange={(e) => handleInSelect(e)}></Select>
        </div>
        <div>
          Output:
          <Select multi={false} value={outputSelection} options={outputSelectionList} onChange={(e) => handleOutSelect(e)}></Select>
        </div>
      </div>
      <button className="TestButton" onClick={(e) => playTestTone(e)}>
        Test Audio
      </button>
    </div>
    </>
  );
}
