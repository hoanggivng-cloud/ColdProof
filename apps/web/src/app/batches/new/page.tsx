import { ShipmentSetup } from '../../../components/shipment/ShipmentSetup';
import { setupDevices, setupPresets } from '../../../mocks/shipment-setup';
export default function NewBatch() { return <ShipmentSetup presets={setupPresets} devices={setupDevices} />; }
