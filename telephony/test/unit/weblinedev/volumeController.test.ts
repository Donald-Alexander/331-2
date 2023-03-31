import { WebLineDev } from '@src/weblinedev/weblinedev';
import { webCfg } from '@src/config/webcfg';
import { volumeController, VolumeControlFunction, VolumeControlDestination } from '@src/weblinedev/volumeController';

jest.mock('@src/config/webcfg');

const {defaultRingerVolume} = webCfg.positionCfg;
const {defaultConversationVolume} = webCfg.positionCfg;

class MockWebLineDev extends EventTarget {}
const mockedLineDev = new MockWebLineDev();
beforeAll(() => {
  volumeController.init(mockedLineDev as WebLineDev);
});
afterAll(() => {});

beforeEach(() => {});
afterEach(() => {});

describe('VolumeController', () => {
  test('getDefaultVolume', () => {
    const vol1 = volumeController.getDefaultVolume(VolumeControlFunction.Ringer, VolumeControlDestination.Handset);
    const vol2 = volumeController.getDefaultVolume(VolumeControlFunction.Ringer, VolumeControlDestination.Speaker);
    // hardcoded in mocked webCfg
    expect(vol1).toBe(defaultRingerVolume);
    expect(vol2).toBe(defaultRingerVolume);

    const vol3 = volumeController.getDefaultVolume(
      VolumeControlFunction.Conversation,
      VolumeControlDestination.Handset
    );
    // hardcoded in mocked webCfg
    expect(vol3).toBe(defaultConversationVolume);
  });

  test('setVolume/getVolume', () => {
    let v1 = 37.125;
    volumeController.setVolume(VolumeControlFunction.Ringer, VolumeControlDestination.Handset, v1);
    let v2 = volumeController.getCurrentVolume(VolumeControlFunction.Ringer, VolumeControlDestination.Handset);
    expect(v2).toBe(v1);
    expect(v1).not.toBe(defaultRingerVolume);

    v1 = 38.125;
    volumeController.setVolume(VolumeControlFunction.Ringer, VolumeControlDestination.Speaker, v1);
    v2 = volumeController.getCurrentVolume(VolumeControlFunction.Ringer, VolumeControlDestination.Speaker);
    expect(v2).toBe(v1);
    expect(v1).not.toBe(defaultRingerVolume);

    v1 = 37.325;
    volumeController.setVolume(VolumeControlFunction.Playback, VolumeControlDestination.Handset, v1);
    v2 = volumeController.getCurrentVolume(VolumeControlFunction.Playback, VolumeControlDestination.Handset);
    expect(v2).toBe(v1);

    v1 = 38.325;
    volumeController.setVolume(VolumeControlFunction.Playback, VolumeControlDestination.Speaker, v1);
    v2 = volumeController.getCurrentVolume(VolumeControlFunction.Playback, VolumeControlDestination.Speaker);
    expect(v2).toBe(v1);
  });
});
