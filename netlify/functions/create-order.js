// netlify/functions/create-order.js
//
// 주문 생성을 서버에서 처리하는 함수.
// - 브라우저가 보낸 가격을 신뢰하지 않고, DB의 현재 가격을 다시 조회해서 최종 금액을 계산한다.
// - 재고를 확인하고 부족하면 주문을 거부한다.
// - 주문/주문상품/결제 레코드를 만들고, 재고를 차감하고, 장바구니 항목을 지운다.
//
// 필요한 환경변수 (Netlify 대시보드 > Site configuration > Environment variables 에서 설정):
//   SUPABASE_URL              (예: https://xxxx.supabase.co)
//   SUPABASE_ANON_KEY         (anon public 키 — 사용자 토큰 검증용)
//   SUPABASE_SERVICE_ROLE_KEY (service_role 키 — RLS 우회, 절대 브라우저 코드에 넣지 말 것)

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: '서버 환경변수가 설정되지 않았습니다.' }) };
  }

  try {
    // ---------- 1. 로그인 사용자 검증 ----------
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : null;
    if (!token) {
      return { statusCode: 401, body: JSON.stringify({ error: '로그인이 필요합니다.' }) };
    }

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
    });
    if (!userRes.ok) {
      return { statusCode: 401, body: JSON.stringify({ error: '로그인 정보가 유효하지 않습니다.' }) };
    }
    const user = await userRes.json();
    const userId = user.id;

    // ---------- 2. 요청 바디 파싱 ----------
    const body = JSON.parse(event.body || '{}');
    const { cartIds, receiver_name, receiver_phone, address, address_detail, request_note, payment_method } = body;

    if (!Array.isArray(cartIds) || cartIds.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: '주문할 상품이 없습니다.' }) };
    }
    if (!receiver_name || !receiver_phone || !address) {
      return { statusCode: 400, body: JSON.stringify({ error: '배송정보를 모두 입력해주세요.' }) };
    }

    const svcHeaders = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    };

    // ---------- 3. 장바구니 항목을 서버에서 다시 조회 (가격/재고 신뢰 X) ----------
    const idsFilter = cartIds.join(',');
    const cartRes = await fetch(
      `${SUPABASE_URL}/rest/v1/carts?id=in.(${idsFilter})&select=id,qty,user_id,product_id,product_option_id,products(name,list_price,sale_price),product_options(extra_price,inventories(id,current_stock))`,
      { headers: svcHeaders }
    );
    const cartRows = await cartRes.json();

    if (!Array.isArray(cartRows) || cartRows.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: '장바구니 정보를 찾을 수 없습니다.' }) };
    }
    // 본인 장바구니가 맞는지 검증
    if (cartRows.some(r => r.user_id !== userId)) {
      return { statusCode: 403, body: JSON.stringify({ error: '본인의 장바구니만 주문할 수 있습니다.' }) };
    }

    // ---------- 4. 서버에서 가격/재고 재계산 ----------
    let totalList = 0;
    let totalFinal = 0;
    const orderItemsPayload = [];
    const stockUpdates = [];

    for (const row of cartRows) {
      const product = row.products;
      const option = row.product_options;
      if (!product) {
        return { statusCode: 400, body: JSON.stringify({ error: '존재하지 않는 상품이 포함되어 있습니다.' }) };
      }
      const extra = option?.extra_price || 0;
      const unitPrice = product.sale_price + extra; // 서버가 다시 계산한 실제 단가
      const listUnitPrice = product.list_price + extra;

      if (option?.inventories) {
        const currentStock = option.inventories.current_stock;
        if (currentStock < row.qty) {
          return { statusCode: 400, body: JSON.stringify({ error: `'${product.name}' 재고가 부족합니다. (남은 재고 ${currentStock}개)` }) };
        }
        stockUpdates.push({ inventoryId: option.inventories.id, newStock: currentStock - row.qty });
      }

      totalList += listUnitPrice * row.qty;
      totalFinal += unitPrice * row.qty;

      orderItemsPayload.push({
        product_id: row.product_id,
        option_id: row.product_option_id,
        qty: row.qty,
        price: unitPrice,
      });
    }

    const discountAmount = totalList - totalFinal;
    const shippingFee = 0; // 현재 전 상품 무료배송 정책
    const finalAmount = totalFinal + shippingFee;

    // ---------- 5. 주문번호 생성 ----------
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const rand = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
    const orderNo = `LV${y}${m}${d}${rand}`;

    // ---------- 6. 주문 생성 ----------
    const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: 'POST',
      headers: { ...svcHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        order_no: orderNo,
        user_id: userId,
        status: '결제완료',
        payment_method,
        total_amount: totalList,
        discount_amount: discountAmount,
        shipping_fee: shippingFee,
        final_amount: finalAmount,
        receiver_name,
        receiver_phone,
        address,
        address_detail,
        request_note,
      }),
    });
    const orderRows = await orderRes.json();
    if (!orderRes.ok || !orderRows[0]) {
      return { statusCode: 500, body: JSON.stringify({ error: '주문 생성에 실패했습니다.' }) };
    }
    const orderId = orderRows[0].id;

    // ---------- 7. 주문상품 생성 ----------
    await fetch(`${SUPABASE_URL}/rest/v1/order_items`, {
      method: 'POST',
      headers: svcHeaders,
      body: JSON.stringify(orderItemsPayload.map(item => ({ ...item, order_id: orderId }))),
    });

    // ---------- 8. 결제 레코드 생성 (모의 결제 — 실제 PG 연동 전 임시 처리) ----------
    await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
      method: 'POST',
      headers: svcHeaders,
      body: JSON.stringify({
        order_id: orderId,
        method: payment_method,
        status: '결제완료',
        paid_at: new Date().toISOString(),
      }),
    });

    // ---------- 9. 재고 차감 ----------
    for (const u of stockUpdates) {
      await fetch(`${SUPABASE_URL}/rest/v1/inventories?id=eq.${u.inventoryId}`, {
        method: 'PATCH',
        headers: svcHeaders,
        body: JSON.stringify({ current_stock: u.newStock }),
      });
    }

    // ---------- 10. 주문 완료된 장바구니 항목 삭제 ----------
    await fetch(`${SUPABASE_URL}/rest/v1/carts?id=in.(${idsFilter})`, {
      method: 'DELETE',
      headers: svcHeaders,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ order_no: orderNo, final_amount: finalAmount }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: '주문 처리 중 오류가 발생했습니다.' }) };
  }
};
