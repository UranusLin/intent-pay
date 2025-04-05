import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');
  const chainId = searchParams.get('chainId');
  const useCache = searchParams.get('useCache') === 'true';

  if (!address) {
    return NextResponse.json(
      { error: 'Wallet address is required' },
      { status: 400 }
    );
  }

  if (!chainId) {
    return NextResponse.json(
      { error: 'Chain ID is required' },
      { status: 400 }
    );
  }

  try {
    const response = await axios.get(
      'https://api.1inch.dev/portfolio/portfolio/v4/overview/erc20/details',
      {
        headers: {
          'Authorization': `Bearer bU3wtFzdNutmkzsdlSuEtYgrvC6SUKiA`,
          'Accept': 'application/json',
        },
        params: { address, chain_id: Number(chainId), use_cache: useCache }
      }
    );

    console.log('response', response.data)

    return NextResponse.json(response.data);
  } catch (error) {
    console.error('Error fetching ERC20 current value:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ERC20 current value' },
      { status: 500 }
    );
  }
} 