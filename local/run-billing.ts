async function runBilling() {
  console.log('🔄 Running billing service...\n');

  const { handler: billingHandler } = await import('../apps/billing-service/src/handler');

  await billingHandler({
    'detail-type': 'Scheduled Event',
    time: new Date().toISOString(),
  } as any);

  console.log('\n✅ Billing complete!');
}

runBilling().catch(console.error);
