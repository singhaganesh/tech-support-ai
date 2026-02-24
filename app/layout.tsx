import type { Metadata } from 'next';
import '../src/app/globals.css';

export const metadata: Metadata = {
    title: 'Dexter Support AI',
    description: 'Service Engineer Chatbot — Powered by SEPLE',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
