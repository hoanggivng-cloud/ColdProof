import fs from 'node:fs';
const file = 'apps/web/src/components/shipment/ShipmentWorkflow.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  'prepare: (value, ids) => { setShipment(value); setDeviceIds(ids); setDevicesConfirmed(false); setHandover(null); },',
  'prepare: (value, ids) => { setShipment(value); setDeviceIds(ids); setDevicesConfirmed(ids.length > 0); },'
);
content = content.replace(
  'assign: (ids, confirmed = true) => { setDeviceIds(ids); setDevicesConfirmed(Boolean(shipment) && ids.length > 0 && confirmed); setHandover(null); },',
  'assign: (ids, confirmed = true) => { setDeviceIds(ids); setDevicesConfirmed(Boolean(shipment) && ids.length > 0 && confirmed); },'
);
fs.writeFileSync(file, content);
