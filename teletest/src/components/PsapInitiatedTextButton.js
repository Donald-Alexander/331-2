import React, { useEffect, useState } from 'react';
import './../css/PsapInitiatedTextButton.css';

export function PsapInitiatedTextButton({ webTeletest }) {
  const [pitToggleBtnName, setPitToggleBtnName] = useState("PIT");
  const [isBlue, setBlue] = useState(false);

  const PitToggleButton = async () => {
    if (!isBlue) {
      setPitToggleBtnName("PIT");
      setBlue(true);
      webTeletest.guiTest.setPitInitialMsg("Initial MSRP PIT dummy message");
    }
    else {
      setPitToggleBtnName("PIT");
      setBlue(false); 
      webTeletest.guiTest.setPitInitialMsg("");
    }
  }

  return (
    <>
      <button
        className={isBlue?"Msrp-TogOn":"Msrp-TogOff"}
        onClick={PitToggleButton}>{pitToggleBtnName}
      </button>
    </>
  );
}
