import React, { useEffect } from 'react';
import './../css/VolumeControllerBox.css';
import './../App.css';
import {
  VolumeControlFunction,
  VolumeControlDestination,
} from 'telephony/src/weblinedev/volumeController';

export function VolumeControllerBox({ webTeletest }) {
  // Called only once when the component load.  Simulate a constructor !
  useEffect(() => {
    console.log('Volume Controller Box started');
  }, []);

  const getDefaultVolumes = async (e) => {
    webTeletest.getDefaultVolumes()
  }

  // Handlers for sliders
  const onInputConversation = async (e) => {
    const v = parseInt(e.target.value, 10);
    webTeletest.setVolume(VolumeControlFunction.Conversation, VolumeControlDestination.Handset, v);
  }

  const onInputRingerHandset = async (e) => {
    const v = parseInt(e.target.value, 10);
    webTeletest.setVolume(VolumeControlFunction.Ringer, VolumeControlDestination.Handset, v);
  }

  const onInputRingerSpeaker = async (e) => {
    const v = parseInt(e.target.value, 10);
    webTeletest.setVolume(VolumeControlFunction.Ringer, VolumeControlDestination.Speaker, v);
  }

  const onInputPlaybackHandset = async (e) => {
    const v = parseInt(e.target.value, 10);
    webTeletest.setVolume(VolumeControlFunction.Playback, VolumeControlDestination.Handset, v);
  }

  const onInputPlaybackSpeaker = async (e) => {
    const v = parseInt(e.target.value, 10);
    webTeletest.setVolume(VolumeControlFunction.Playback, VolumeControlDestination.Speaker, v);
  }

  // Handlers for checkbox
  const onChangeRingerHandset = async (e) => {
    const checked = e.target.checked;
    const v = webTeletest.getCurrentVolume(VolumeControlFunction.Ringer, VolumeControlDestination.Handset);
    webTeletest.setVolume(VolumeControlFunction.Ringer, VolumeControlDestination.Handset, checked ? v : 0);
    webTeletest.setState({ chkRingerHandset: checked, volumeRingerHandset: checked ? v : 0 });
  }

  const onChangeRingerSpeaker = async (e) => {
    const checked = e.target.checked;
    const v = webTeletest.getCurrentVolume(VolumeControlFunction.Ringer, VolumeControlDestination.Speaker);
    webTeletest.setVolume(VolumeControlFunction.Ringer, VolumeControlDestination.Speaker, checked ? v : 0);
    webTeletest.setState({ chkRingerSpeaker: checked, volumeRingerSpeaker: checked ? v : 0 });
  }

  const onChangePlaybackHandset = async (e) => {
    const checked = e.target.checked;
    const v = webTeletest.getCurrentVolume(VolumeControlFunction.Playback, VolumeControlDestination.Handset);
    webTeletest.setVolume(VolumeControlFunction.Playback, VolumeControlDestination.Handset, checked ? v : 0);
    webTeletest.setState({ chkPlaybackHandset: checked, volumePlaybackHandset: checked ? v : 0 });
  }

  const onChangePlaybackSpeaker = async (e) => {
    const checked = e.target.checked;
    const v = webTeletest.getCurrentVolume(VolumeControlFunction.Playback, VolumeControlDestination.Speaker);
    webTeletest.setVolume(VolumeControlFunction.Playback, VolumeControlDestination.Speaker, checked ? v : 0);
    webTeletest.setState({ chkPlaybackSpeaker: checked, volumePlaybackSpeaker: checked ? v : 0 });
  }


  return (
    <div className="volume-controller">
      <div className="title">Volume Controller</div>
      <div className="row">
        <div className="title-handset">Handset</div>
        <div className="title-ringer">Ringer</div>
        <div className="title-playback">Playback</div>
      </div>
      <div className="row">
        <div className="slider-container">
          <p className="slider-header"><span>H:{webTeletest.state.volumeConversation}</span></p>
          <input type="range" className="slider" min="0" max="100" step='1'
            value={webTeletest.state.volumeConversation}
            onInput={(e) => onInputConversation(e)} />
          <button className="button" onClick={(e) => getDefaultVolumes()}>Default</button>
        </div>
        <div className="slider-container">
          <p className="slider-header"><span>H:{webTeletest.state.volumeRingerHandset}</span></p>
          <input type="range" className="slider" min="0" max="100" step='1'
            value={webTeletest.state.volumeRingerHandset} disabled={!webTeletest.state.chkRingerHandset}
            onInput={(e) => onInputRingerHandset(e)} />
          <input type="checkbox" className="slider-foot" checked={webTeletest.state.chkRingerHandset}
            onChange={(e) => onChangeRingerHandset(e)} />
        </div>
        <div className="slider-container">
          <p className="slider-header"><span>S:{webTeletest.state.volumeRingerSpeaker}</span></p>
          <input type="range" className="slider" min="0" max="100" step='1'
            value={webTeletest.state.volumeRingerSpeaker} disabled={!webTeletest.state.chkRingerSpeaker}
            onInput={(e) => onInputRingerSpeaker(e)} />
          <input type="checkbox" className="slider-foot" checked={webTeletest.state.chkRingerSpeaker}
            onChange={(e) => onChangeRingerSpeaker(e)} />
        </div>
        <div className="slider-container">
          <p className="slider-header"><span>H:{webTeletest.state.volumePlaybackHandset}</span></p>
          <input type="range" className="slider" min="0" max="100" step='1'
            value={webTeletest.state.volumePlaybackHandset} disabled={!webTeletest.state.chkPlaybackHandset}
            onInput={(e) => onInputPlaybackHandset(e)} />
          <input type="checkbox" className="slider-foot" checked={webTeletest.state.chkPlaybackHandset}
            onChange={(e) => onChangePlaybackHandset(e)} />
        </div>
        <div className="slider-container">
          <p className="slider-header"><span >S:{webTeletest.state.volumePlaybackSpeaker}</span></p>
          <input type="range" className="slider" min="0" max="100" step='1'
            value={webTeletest.state.volumePlaybackSpeaker} disabled={!webTeletest.state.chkPlaybackSpeaker}
            onInput={(e) => onInputPlaybackSpeaker(e)} />
          <input type="checkbox" className="slider-foot" checked={webTeletest.state.chkPlaybackSpeaker}
            onChange={(e) => onChangePlaybackSpeaker(e)} />
        </div>
      </div>
    </div>
  );
}
