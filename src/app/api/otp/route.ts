// src/app/api/otp/route.ts

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { accountId } = await request.json();
    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    const appId = process.env.NEXT_PUBLIC_DERIV_APP_ID;
    if (!appId) {
      return NextResponse.json({ error: 'DERIV_APP_ID not configured' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');

    const response = await fetch(
      `https://api.derivws.com/trading/v1/options/accounts/${accountId}/otp`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Deriv-App-ID': appId,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();
    if (!response.ok) return NextResponse.json(data, { status: response.status });
    return NextResponse.json({ websocket_url: data.websocket_url });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
