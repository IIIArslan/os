import fetch from "node-fetch";

const API_URL = "https://api.monday.com/v2";
const API_KEY = process.env.MONDAY_API_KEY || "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjI3OTYzMTY1MCwiYWFpIjoxMSwidWlkIjozOTM1MjM2MiwiaWFkIjoiMjAyMy0wOS0wNVQxMTo1OTo1Ni4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MTUxNTI5NjMsInJnbiI6ImV1YzEifQ.QM4nD1KOxtHyV_4u4RF-C6zpfA40Sp5Q9XbHWHQM1nM";

async function graphqlQuery(query, variables = {}) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": API_KEY
    },
    body: JSON.stringify({ query, variables })
  });
  return await response.json();
}

// Board isim eşleşmeleri
const boardMapping = {
  "Leads": "2030966624",
  "Potential": "2030966618",
  "Kayıt & Vize": "2030966612",
  "Akademik": "2030966614"
};

// Her board için Connect Boards kolon ID'si
const connectColumnMapping = {
  "Leads": "board_relation_mkt5e7ge",
  "Potential": "board_relation_mkt5nd8s",
  "Kayıt & Vize": "board_relation_mkt5xv3g",
  "Akademik": "board_relation_mkt5rzbn"
};

// Ankara board ID'sini isimle bul
async function findBoardIdByNaconnect_potentialme(name) {
  const query = `{ boards { id name } }`;
  const data = await graphqlQuery(query);
  const boards = data.data.boards;
  const board = boards.find(b => b.name === name);
  return board ? board.id : null;
}

// Ankara'da yeni item yarat ve Connect Boards kolonunu Adana item ID ile güncelle
async function createItemInAnkara(boardName, adanaItemId, itemName) {
  const ankaraBoardId = await findBoardIdByName(boardName);
  if (!ankaraBoardId) {
    console.error("Ankara board bulunamadı:", boardName);
    return;
  }

  // Yeni item oluştur
  const createQuery = `
    mutation ($boardId: Int!, $itemName: String!) {
      create_item(board_id: $boardId, item_name: $itemName) {
        id
      }
    }
  `;
  const createRes = await graphqlQuery(createQuery, {
    boardId: parseInt(ankaraBoardId),
    itemName: `(Adana) ${itemName}`
  });

  const ankaraItemId = createRes.data.create_item.id;
  console.log("Ankara'da yeni item oluşturuldu:", ankaraItemId);

  // Connect Boards kolonunu Adana item ID ile bağla
  const connectColumnId = connectColumnMapping[boardName];
  if (!connectColumnId) {
    console.error("Connect Boards kolon ID bulunamadı:", boardName);
    return;
  }
  const connectValue = JSON.stringify({ item_ids: [adanaItemId] });

  const connectQuery = `
    mutation ($boardId: Int!, $itemId: Int!, $columnId: String!, $value: JSON!) {
      change_column_value(
        board_id: $boardId,
        item_id: $itemId,
        column_id: $columnId,
        value: $value
      ) { id }
    }
  `;
  await graphqlQuery(connectQuery, {
    boardId: parseInt(ankaraBoardId),
    itemId: parseInt(ankaraItemId),
    columnId: connectColumnId,
    value: connectValue
  });

  return ankaraItemId;
}

// Ankara item kolon güncelle
async function updateItemInAnkara(boardName, adanaItemId, columnId, newValue) {
  const ankaraBoardId = await findBoardIdByName(boardName);
  if (!ankaraBoardId) return;

  const connectColumnId = connectColumnMapping[boardName];
  if (!connectColumnId) {
    console.error("Connect Boards kolon ID bulunamadı:", boardName);
    return;
  }

  // Connect Boards üzerinden Ankara item ID'sini bul
  const itemsQuery = `
    query ($boardId: Int!) {
      boards (ids: [$boardId]) {
        items {
          id
          name
          column_values {
            id
            value
          }
        }
      }
    }
  `;
  const itemsRes = await graphqlQuery(itemsQuery, { boardId: parseInt(ankaraBoardId) });
  const items = itemsRes.data.boards[0].items;

  // Adana item ID'si ile eşleşen Ankara item'i bul
  const targetItem = items.find(item => {
    const connectColumn = item.column_values.find(cv => cv.id === connectColumnId);
    return connectColumn && connectColumn.value && connectColumn.value.includes(adanaItemId);
  });

  if (!targetItem) {
    console.log("Eşleşen Ankara item bulunamadı:", adanaItemId);
    return;
  }

  const ankaraItemId = targetItem.id;

  const updateQuery = `
    mutation ($boardId: Int!, $itemId: Int!, $columnId: String!, $value: String!) {
      change_simple_column_value(
        board_id: $boardId,
        item_id: $itemId,
        column_id: $columnId,
        value: $value
      ) { id }
    }
  `;

  await graphqlQuery(updateQuery, {
    boardId: parseInt(ankaraBoardId),
    itemId: parseInt(ankaraItemId),
    columnId,
    value: newValue
  });
  console.log("Ankara'daki item güncellendi:", ankaraItemId);
}

export default async function runAction(payload) {
  try {
    const boardName = payload.payload.boardName;
    const itemName = payload.payload.itemName;
    const adanaItemId = payload.payload.itemId;
    const columnId = payload.payload.columnId;
    const newValue = payload.payload.value;
    const changeType = payload.payload.eventType; // item_created veya column_value_changed

    // Board eşleşmesi kontrolü
    if (!boardMapping[boardName]) {
      console.log("Adana board eşleşmesi yok, işlem yapılmadı:", boardName);
      return;
    }

    const targetBoardName = boardMapping[boardName];

    if (changeType === "item_created") {
      await createItemInAnkara(targetBoardName, adanaItemId, itemName);
    } else if (changeType === "column_value_changed") {
      await updateItemInAnkara(targetBoardName, adanaItemId, columnId, newValue);
    }
  } catch (error) {
    console.error("Hata:", error);
  }
}
