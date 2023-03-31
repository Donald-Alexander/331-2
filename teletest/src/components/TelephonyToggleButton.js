import React, {useRef, useEffect} from "react";
import "./../css/TelephonyToggleButton.css";


export function TelephonyToggleButton({guiTest, defaultName, activeName}) {
  const myBtnRef = React.useRef(null);
  const [isAutoStart, setAutoStart] = React.useState(guiTest.getAutoStartTelephony());
  const [name, setName] = React.useState(defaultName);
  const [isGreen, setGreen] = React.useState(false);

  // console.log('TelephonyToggleButton component rendering....');
  
  // Called only once when the component load.  Simulate a constructor !
  useEffect(() => {
    if (isAutoStart) {
      myBtnRef.current.click();
      console.log('Force Telephony start was set');
      setAutoStart(false);
    }
  }, []);
  
  const toggleButton = async () => {
    if (name === defaultName || isAutoStart) {
      await guiTest
        .start()
        .then(async () => {
          setName(activeName);
          setGreen(true); 
          console.log('[react] Telephony started successfully !');
        })
        .catch(e => {
          console.error('[react] Telephony start failed (' + e + ')');
        })
    }
    else {
      setName(defaultName);
      setGreen(false); 
      // Stop Telephony
      await guiTest.stop().catch(console.error);
    }
  }

  return (
    <div>
      <button
        className={isGreen?"On":"Off"}
        ref={myBtnRef}
        onClick={toggleButton}>{name}
      </button>
    </div>
  );
}
