import { redirect } from 'next/navigation';
/** Accounts are issued by an administrator; there is no self-registration. */
export default function Register() { redirect('/login'); }
