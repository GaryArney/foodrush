const GRID_WIDTH = 6;
const GRID_HEIGHT = 6;
const TILE_SIZE = 60; // Slightly smaller tiles might help on mobile
const UI_AREA_HEIGHT = 160; // Reserve space at the top for UI
const SPRITE_SHEET_KEY = 'foodSprites';
const SPRITE_WIDTH = 16;
const SPRITE_HEIGHT = 16;
const TOTAL_SPRITES = 81;
const SPRITES_PER_ROW = 9; // Spritesheet layout: 9 columns
const ITEM_TYPES_TO_USE = 10; // Number of unique item types on the board at start
const COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff]; // Red, Green, Blue, Yellow, Magenta

const SPRITE_NAMES = [
    "Red Apple", "Green Apple", "Cookie", "Egg", "Scrambled Egg",
    "Cheese", "Baguette", "Potato", "Onion", "Water"
]; // Indices 0-9

const STATIC_ORDERS_DEF = [
    { id: 0, requiredIndices: [0] },          // 1: Red Apple
    { id: 1, requiredIndices: [2, 3] },       // 2: Cookie, Egg
    { id: 2, requiredIndices: [1, 5] },       // 3: Green Apple, Cheese
    { id: 3, requiredIndices: [6, 7, 8] },    // 4: Baguette, Potato, Onion
    { id: 4, requiredIndices: [4, 9] },       // 5: Scrambled Egg, Water
    { id: 5, requiredIndices: [0, 1, 2] },    // 6: Red Apple, Green Apple, Cookie
    { id: 6, requiredIndices: [3, 4, 5] },    // 7: Egg, Scrambled Egg, Cheese
    { id: 7, requiredIndices: [7, 8, 9] },    // 8: Potato, Onion, Water
    { id: 8, requiredIndices: [0, 3, 6, 9] }, // 9: Red Apple, Egg, Baguette, Water
    { id: 9, requiredIndices: [1, 2, 5, 7, 8] } // 10: Green Apple, Cookie, Cheese, Potato, Onion
];

let game;

class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        console.log("BootScene: Preloading assets...");
        this.load.spritesheet(SPRITE_SHEET_KEY, 'sprites/fooddd.png', {
            frameWidth: SPRITE_WIDTH,
            frameHeight: SPRITE_HEIGHT
        });
        
        // Load sounds
        console.log("BootScene: Preloading sounds...");
        this.load.audio('swapSound', 'sounds/swap.mp3');
        this.load.audio('matchSound', 'sounds/match.mp3');
        this.load.audio('bgm', 'sounds/bgm(reddish).mp3'); // Load BGM
    }

    create() {
        console.log("BootScene: Assets loaded, starting GameScene...");
        // Log available frames to verify sprite sheet loading
        // const texture = this.textures.get(SPRITE_SHEET_KEY);
        // console.log(`Frames available in ${SPRITE_SHEET_KEY}: ${texture.frameTotal}`);
        this.scene.start('GameScene');
    }
}

class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
        this.grid = [];
        this.items = null;
        this.selectedItem = null;
        this.canSwap = true;

        // Item Generation Bag
        this.itemGenerationBag = [];
        this.itemPoolIndices = Array.from({ length: 10 }, (_, i) => i); // 0-9

        // Order System Properties
        this.gameOrders = [];
        this.totalOrdersToWin = 10;
        this.isGameWon = false;
        this.winScreenGroup = null;
        this.completedOrders = 0; // Added missing property back

        // Configurable Order Parameters (Remove unused)
        // this.maxOrders = 5; // Removed
        // this.orderInterval = 20000; // Removed
        // this.orderTimeLimit = 60000; // Removed
        this.minOrderItems = 1;
        this.maxOrderItems = 3; // Adjusted max items
    }

    preload() {
        // Assets should be loaded in BootScene
    }

    create() {
        console.log("GameScene: Creating...");

        this.items = this.add.group();
        this.orderDisplayGroup = this.add.group();
        this.refillItemGenerationBag();

        // Play background music
        this.sound.play('bgm', { 
            loop: true, 
            volume: 0.3 // Adjust volume (0 to 1)
        });

        // --- UI Setup (Top Area) ---
        const uiXPadding = 10;
        const uiYPadding = 10;
        let currentY = uiYPadding;

        // Initialize static orders & create displays in UI area
        this.gameOrders = STATIC_ORDERS_DEF.map(def => ({
            ...def,
            requiredNames: def.requiredIndices.map(index => SPRITE_NAMES[index] || `Item ${index + 1}`),
            completed: false,
            display: null
        }));

        const orderFontSize = '10px';
        const orderYSpacing = 12;

        this.gameOrders.forEach((order, index) => {
            const orderText = `Order ${order.id + 1}: [${order.requiredNames.join(', ')}]`;
            const displayTxt = this.add.text(uiXPadding, currentY, orderText,
                { fontSize: orderFontSize, fill: '#fff', padding: { x: 2, y: 1 } }
            );
            order.display = displayTxt;
            this.orderDisplayGroup.add(displayTxt);
            currentY += orderYSpacing;
        });

        // Add Completed Counter (Top Right)
        this.completedOrdersText = this.add.text(
            this.game.config.width - uiXPadding,
            uiYPadding,
            `Completed: ${this.completedOrders}/${this.totalOrdersToWin}`,
            { fontSize: '14px', fill: '#0f0', align: 'right' }
        ).setOrigin(1, 0);

        // --- Grid Setup (Below UI) ---
        this.createGridData();
        this.drawGrid(); // Uses UI_AREA_HEIGHT offset now
        this.setupInput();

        // --- Win Screen Setup (Centered, Initially Hidden) ---
        this.winScreenGroup = this.add.group();
        const winBg = this.add.rectangle(this.game.config.width / 2, this.game.config.height / 2, this.game.config.width * 0.8, 150, 0x000000, 0.85).setDepth(10);
        const winText = this.add.text(this.game.config.width / 2, this.game.config.height / 2, `YOU WIN!\nClick to Continue`,
            { fontSize: '28px', fill: '#0f0', align: 'center', padding: 10 }
        ).setOrigin(0.5).setDepth(11);
        this.winScreenGroup.addMultiple([winBg, winText]);
        this.winScreenGroup.setVisible(false);
    }

    update(time, delta) {
       // Update static order display
        this.gameOrders.forEach(order => {
            if (order.display && order.display.visible) { // Only update if visible
                const baseText = `Order ${order.id + 1}: [${order.requiredNames.join(', ')}]`;
                if (order.completed) {
                    if (order.display.text !== baseText + ' [DONE]') { // Avoid redundant updates
                        order.display.setText(baseText + ' [DONE]');
                        order.display.setStyle({ fill: '#55ff55', fontStyle: 'italic' }); // Brighter green
                    }
                } else {
                    // Reset text/style if it was previously marked done (e.g., replay)
                     if (order.display.style.fontStyle === 'italic') {
                         order.display.setText(baseText);
                         order.display.setStyle({ fill: '#fff', fontStyle: 'normal' });
                    }
                }
            }
        });
    }

    // --- Game Setup Methods ---
    refillItemGenerationBag() {
        console.log("Refilling item generation bag (Indices 0-9)...");
        this.itemGenerationBag = [...this.itemPoolIndices];
        Phaser.Utils.Array.Shuffle(this.itemGenerationBag);
    }
    createGridData() {
        console.log("Creating grid data structure using bag generation...");
        this.grid = [];
        for (let y = 0; y < GRID_HEIGHT; y++) {
            this.grid[y] = [];
            for (let x = 0; x < GRID_WIDTH; x++) {
                this.grid[y][x] = this.generateNonMatchingItem(x, y);
            }
        }
        // Prevent initial matches, but DON'T enable swap here
        this.preventAutoMatches( [], false ); 
        console.log("Grid data created.");
    }
    generateNonMatchingItem(x, y) {
        let potentialItem; let loops = 0; const maxColorLoops = COLORS.length * 2; let spriteIndex; let color;
        if (this.itemGenerationBag.length === 0) { this.refillItemGenerationBag(); }
        spriteIndex = this.itemGenerationBag.pop();
        do { color = Phaser.Utils.Array.GetRandom(COLORS); loops++;
            if (loops > maxColorLoops) { console.warn(`generateNonMatchingItem: Could not find non-matching color for sprite ${spriteIndex+1} at (${x}, ${y}).`); break; }
        } while (this.checkMatchAt(x, y, color));
        potentialItem = { spriteIndex: spriteIndex, color: color, sprite: null, x: x, y: y };
        return potentialItem;
    }
    checkMatchAt(x, y, color) {
        let countH = 1;
        if (x > 0 && this.grid[y]?.[x-1]?.color === color) { countH++; if (x > 1 && this.grid[y]?.[x-2]?.color === color) countH++; }
        if (x < GRID_WIDTH - 1 && this.grid[y]?.[x+1]?.color === color) { countH++; if (x < GRID_WIDTH - 2 && this.grid[y]?.[x+2]?.color === color) countH++; }
        if (x > 0 && x < GRID_WIDTH - 1 && this.grid[y]?.[x-1]?.color === color && this.grid[y]?.[x+1]?.color === color) { return true; }
        if (countH >= 3) return true;
        let countV = 1;
        if (y > 0 && this.grid[y-1]?.[x]?.color === color) { countV++; if (y > 1 && this.grid[y-2]?.[x]?.color === color) { countV++; } }
        if (y < GRID_HEIGHT - 1 && this.grid[y+1]?.[x]?.color === color) { countV++; if (y < GRID_HEIGHT - 2 && this.grid[y+2]?.[x]?.color === color) { countV++; } }
        if (y > 0 && y < GRID_HEIGHT - 1 && this.grid[y-1]?.[x]?.color === color && this.grid[y+1]?.[x]?.color === color) { return true; }
        if (countV >= 3) return true;
        return false;
    }

    // Modified drawGrid for UI offset, centering, and rounded corners
    drawGrid() {
        console.log("Drawing grid visuals...");
        const gridOffsetY = UI_AREA_HEIGHT;
        const gridXPadding = (this.game.config.width - (GRID_WIDTH * TILE_SIZE)) / 2;
        const cornerRadius = 10; // Adjust corner rounding

        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const gridItem = this.grid[y][x];
                if (!gridItem) { console.error(`Null item at (${x},${y}) in drawGrid`); continue; }

                const tileCenterX = x * TILE_SIZE + TILE_SIZE / 2 + gridXPadding;
                const tileCenterY = y * TILE_SIZE + TILE_SIZE / 2 + gridOffsetY;
                const bgSize = TILE_SIZE * 0.9;
                const spriteSize = TILE_SIZE * 0.75;
                const textOffsetY = TILE_SIZE * 0.3;
                
                // --- Use Graphics for Rounded Background ---
                const graphicsX = tileCenterX - bgSize / 2;
                const graphicsY = tileCenterY - bgSize / 2;
                const backgroundGraphics = this.add.graphics({ x: graphicsX, y: graphicsY });
                backgroundGraphics.fillStyle(gridItem.color, 1);
                // Add stroke style (optional)
                // backgroundGraphics.lineStyle(1, 0xaaaaaa, 1); 
                backgroundGraphics.fillRoundedRect(0, 0, bgSize, bgSize, cornerRadius); 
                // if using lineStyle, also call: backgroundGraphics.strokeRoundedRect(0, 0, bgSize, bgSize, cornerRadius);
                backgroundGraphics.setDepth(0);
                // --- End Graphics ---

                const itemSprite = this.items.create(tileCenterX, tileCenterY, SPRITE_SHEET_KEY, gridItem.spriteIndex)
                    .setDisplaySize(spriteSize, spriteSize).setInteractive().setDepth(1);
                itemSprite.clearTint();
                const debugText = this.add.text(tileCenterX, tileCenterY + textOffsetY, `${gridItem.spriteIndex + 1}`, { fontSize: '9px', fill: '#000', backgroundColor: '#fff', padding: { x: 1, y: 0 } }).setOrigin(0.5).setDepth(2);

                gridItem.sprite = itemSprite;
                itemSprite.setData('gridData', gridItem);
                itemSprite.setData('background', backgroundGraphics); // Store graphics object
                itemSprite.setData('debugText', debugText);
            }
        }
        console.log("Grid visuals drawn.");
    }

    setupInput() {
        console.log("Setting up input handlers...");
        this.input.on('gameobjectdown', this.onItemDown, this);
        this.input.on('gameobjectover', this.onItemOver, this);
        this.input.on('pointerup', this.onPointerUp, this); // Use global pointer up

        // We need drag state tracking outside of individual items
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragEndX = 0;
        this.dragEndY = 0;
    }

    // --- Input Handling Methods ---
    onItemDown(pointer, gameObject) {
        if (!this.canSwap || !gameObject.getData('gridData')) return; // Ensure it's a grid item and swapping is allowed

        this.selectedItem = gameObject;
        this.isDragging = true;
        this.dragStartX = pointer.x;
        this.dragStartY = pointer.y;
        console.log("Item down:", this.selectedItem.getData('gridData').x, this.selectedItem.getData('gridData').y);
    }
    onItemOver(pointer, gameObject) {
        if (!this.isDragging || !this.selectedItem || gameObject === this.selectedItem || !gameObject.getData('gridData')) {
            return; // Only interested if dragging over a *different* grid item
        }

        const item1Data = this.selectedItem.getData('gridData');
        const item2Data = gameObject.getData('gridData');

        // Check if the items are adjacent (horizontally or vertically)
        const dx = Math.abs(item1Data.x - item2Data.x);
        const dy = Math.abs(item1Data.y - item2Data.y);

        if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
            console.log("Adjacent item hovered:", item2Data.x, item2Data.y);
            // Initiate the swap immediately upon dragging over adjacent tile
            this.attemptSwap(this.selectedItem, gameObject);
            // Reset drag state after attempting swap
            this.isDragging = false;
            this.selectedItem = null;
        }
    }
    onPointerUp(pointer) {
        // If dragging stops without hovering over an adjacent item, reset state
        if (this.isDragging) {
            console.log("Pointer up without valid swap target.");
            this.isDragging = false;
            this.selectedItem = null;
        }
    }

    // --- Game Logic Methods ---
    attemptSwap(item1, item2) {
        if (!this.canSwap) return;
        // console.log(`Attempting swap...`); // Less verbose
        this.canSwap = false;

        // Play swap sound
        this.sound.play('swapSound', { volume: 0.5 }); // Adjust volume

        const item1Data = item1.getData('gridData');
        const item2Data = item2.getData('gridData');

        this.swapItemsVisually(item1, item2, () => {
            // Update grid data structure
            this.grid[item1Data.y][item1Data.x] = item2Data;
            this.grid[item2Data.y][item2Data.x] = item1Data;

            // Update coordinates within item data
            const tempX = item1Data.x;
            const tempY = item1Data.y;
            item1Data.x = item2Data.x;
            item1Data.y = item2Data.y;
            item2Data.x = tempX;
            item2Data.y = tempY;

            // Check for matches resulting from the swap
            const matches1 = this.findMatchesInvolving(item1Data.x, item1Data.y);
            const matches2 = this.findMatchesInvolving(item2Data.x, item2Data.y);
            const allMatches = [...new Set([...matches1, ...matches2])];

            if (allMatches.length > 0) {
                // console.log("Match found by player swap!");
                this.processMatches(allMatches);
            } else {
                // console.log("No match from swap, swap is permanent.");
                this.canSwap = true;
            }
        });
    }
    
    // Modified swapItemsVisually for Graphics objects
    swapItemsVisually(item1, item2, onCompleteCallback) {
        const item1Data = item1.getData('gridData'); const item2Data = item2.getData('gridData');
        if (!item1Data || !item2Data) return;
        const gridOffsetY = UI_AREA_HEIGHT;
        const gridXPadding = (this.game.config.width - (GRID_WIDTH * TILE_SIZE)) / 2;
        const textOffsetY = TILE_SIZE * 0.3;
        
        // Target CENTERS
        const targetCenterX1 = item2Data.x * TILE_SIZE + TILE_SIZE / 2 + gridXPadding;
        const targetCenterY1 = item2Data.y * TILE_SIZE + TILE_SIZE / 2 + gridOffsetY;
        const targetCenterX2 = item1Data.x * TILE_SIZE + TILE_SIZE / 2 + gridXPadding;
        const targetCenterY2 = item1Data.y * TILE_SIZE + TILE_SIZE / 2 + gridOffsetY;

        const item1DebugText = item1.getData('debugText'); const item2DebugText = item2.getData('debugText');
        const item1Background = item1.getData('background'); const item2Background = item2.getData('background');
        
        // Target TOP-LEFT for Graphics objects
        const bgSize = TILE_SIZE * 0.9;
        const targetGraphicsX1 = targetCenterX1 - bgSize / 2;
        const targetGraphicsY1 = targetCenterY1 - bgSize / 2;
        const targetGraphicsX2 = targetCenterX2 - bgSize / 2;
        const targetGraphicsY2 = targetCenterY2 - bgSize / 2;

        // Combine targets, filtering nulls
        const targets1 = [item1, item1DebugText, item1Background].filter(t => t);
        const targets2 = [item2, item2DebugText, item2Background].filter(t => t);

        if(targets1.length > 0) {
            this.tweens.add({
                targets: targets1,
                x: (target) => { // Calculate target X based on type
                    if (target === item1) return targetCenterX1; // Sprite uses center
                    if (target === item1DebugText) return targetCenterX1;
                    if (target === item1Background) return targetGraphicsX1; // Graphics uses top-left
                    return target.x; // Fallback
                },
                y: (target) => { // Calculate target Y based on type
                    if (target === item1) return targetCenterY1;
                    if (target === item1DebugText) return targetCenterY1 + textOffsetY;
                    if (target === item1Background) return targetGraphicsY1;
                    return target.y; // Fallback
                },
                duration: 200, ease: 'Power2'
            });
        }
        if(targets2.length > 0) {
            this.tweens.add({
                targets: targets2,
                x: (target) => {
                    if (target === item2) return targetCenterX2;
                    if (target === item2DebugText) return targetCenterX2;
                    if (target === item2Background) return targetGraphicsX2;
                    return target.x;
                },
                y: (target) => {
                    if (target === item2) return targetCenterY2;
                    if (target === item2DebugText) return targetCenterY2 + textOffsetY;
                    if (target === item2Background) return targetGraphicsY2;
                    return target.y;
                },
                duration: 200, ease: 'Power2',
                onComplete: onCompleteCallback
            });
        }
    }

    findMatchesInvolving(x, y) {
        const item = this.grid[y][x];
        if (!item) return []; // Should not happen if called correctly

        const colorToMatch = item.color;
        let horizontalMatches = [item]; // Start with the item itself
        let verticalMatches = [item];   // Start with the item itself

        // --- Check Horizontal --- (Left and Right)
        // Check Left
        for (let i = x - 1; i >= 0; i--) {
            const neighbor = this.grid[y][i];
            if (neighbor && neighbor.color === colorToMatch) {
                horizontalMatches.push(neighbor);
            } else {
                break; // Stop if color doesn't match or out of bounds
            }
        }
        // Check Right
        for (let i = x + 1; i < GRID_WIDTH; i++) {
            const neighbor = this.grid[y][i];
            if (neighbor && neighbor.color === colorToMatch) {
                horizontalMatches.push(neighbor);
            } else {
                break; // Stop if color doesn't match or out of bounds
            }
        }

        // --- Check Vertical --- (Up and Down)
        // Check Up
        for (let i = y - 1; i >= 0; i--) {
            const neighbor = this.grid[i][x];
            if (neighbor && neighbor.color === colorToMatch) {
                verticalMatches.push(neighbor);
            } else {
                break; // Stop if color doesn't match or out of bounds
            }
        }
        // Check Down
        for (let i = y + 1; i < GRID_HEIGHT; i++) {
            const neighbor = this.grid[i][x];
            if (neighbor && neighbor.color === colorToMatch) {
                verticalMatches.push(neighbor);
            } else {
                break; // Stop if color doesn't match or out of bounds
            }
        }

        let finalMatches = [];
        // If a horizontal match of 3 or more was found, add it
        if (horizontalMatches.length >= 3) {
            finalMatches = finalMatches.concat(horizontalMatches);
        }
        // If a vertical match of 3 or more was found, add it
        if (verticalMatches.length >= 3) {
             // Avoid adding duplicates if an item is part of both H and V match
             verticalMatches.forEach(matchItem => {
                 if (!finalMatches.includes(matchItem)) {
                     finalMatches.push(matchItem);
                 }
             });
        }

        // console.log(`Matches found involving (${x}, ${y}):`, finalMatches.length > 0 ? finalMatches.map(i => `(${i.x},${i.y})`) : 'None');
        return finalMatches; // Return array of grid data objects
    }

    findMatches() {
        let allMatches = [];
        const checkedItems = new Set(); // Use a Set to avoid adding the same item multiple times

        // Check Horizontally
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH - 2; x++) {
                const item1 = this.grid[y][x];
                if (!item1) continue; // Skip null spots

                const item2 = this.grid[y][x + 1];
                const item3 = this.grid[y][x + 2];

                if (item2 && item3 && item1.color === item2.color && item1.color === item3.color) {
                    let currentMatch = [item1, item2, item3];
                    // Check for longer matches
                    for (let i = x + 3; i < GRID_WIDTH; i++) {
                        const nextItem = this.grid[y][i];
                        if (nextItem && nextItem.color === item1.color) {
                            currentMatch.push(nextItem);
                        } else {
                            break;
                        }
                    }
                    // Add found items to the overall list and the checked set
                    currentMatch.forEach(matchItem => {
                        if (!checkedItems.has(matchItem)) {
                            allMatches.push(matchItem);
                            checkedItems.add(matchItem);
                        }
                    });
                    // Optimization: Skip checked items in this row scan
                    x += currentMatch.length - 1;
                }
            }
        }

        // Check Vertically
        for (let x = 0; x < GRID_WIDTH; x++) {
            for (let y = 0; y < GRID_HEIGHT - 2; y++) {
                const item1 = this.grid[y][x];
                 // Skip null spots AND items already part of a horizontal match found above
                if (!item1 || checkedItems.has(item1)) continue;

                const item2 = this.grid[y + 1][x];
                const item3 = this.grid[y + 2][x];

                if (item2 && item3 && item1.color === item2.color && item1.color === item3.color) {
                    let currentMatch = [item1, item2, item3];
                    // Check for longer matches
                    for (let i = y + 3; i < GRID_HEIGHT; i++) {
                        const nextItem = this.grid[i][x];
                        if (nextItem && nextItem.color === item1.color) {
                            currentMatch.push(nextItem);
                        } else {
                            break;
                        }
                    }
                    // Add found items to the overall list and the checked set
                    currentMatch.forEach(matchItem => {
                        if (!checkedItems.has(matchItem)) {
                            allMatches.push(matchItem);
                            checkedItems.add(matchItem);
                        }
                    });
                     // Optimization: Skip checked items in this column scan
                     y += currentMatch.length - 1;
                }
            }
        }
        return allMatches;
    }

    // --- Matching and Replacement Logic ---
    processMatches(matches) {
        if (matches.length === 0 || this.isGameWon) {
            this.canSwap = !this.isGameWon;
            return;
        }
        
        // Play match sound
        this.sound.play('matchSound', { volume: 0.6 }); // Adjust volume
        
        console.log(`Processing ${matches.length} matched items.`);
        const uniqueItems = [...new Set(matches)];
        const matchedIndices = uniqueItems.map(itemData => itemData.spriteIndex);

        let orderCompletedThisTurn = false;

        // Check static orders
        for (let i = 0; i < this.gameOrders.length; i++) {
            const order = this.gameOrders[i];
            if (!order.completed) {
                const allRequirementsMet = order.requiredIndices.every(reqIndex => matchedIndices.includes(reqIndex));
                if (allRequirementsMet) {
                    console.log(`Static Order ${order.id + 1} requirements met!`);
                    order.completed = true;
                    this.completedOrders++;
                    this.completedOrdersText.setText(`Completed: ${this.completedOrders}/${this.totalOrdersToWin}`);
                    orderCompletedThisTurn = true;

                    if (this.completedOrders >= this.totalOrdersToWin) {
                        this.triggerWin();
                        return;
                    }
                    break;
                }
            }
        }
        // --- End Order Fulfillment Check ---

        const removedLocations = uniqueItems.map(itemData => ({ x: itemData.x, y: itemData.y }));
        let tweensCompleted = 0;
        const totalTweens = uniqueItems.length;

        uniqueItems.forEach(itemData => {
            if (itemData.sprite) {
                const targets = [itemData.sprite, itemData.sprite.getData('background'), itemData.sprite.getData('debugText')].filter(t => t);
                if (targets.length > 0) {
                    this.tweens.add({
                        targets: targets,
                        scaleX: 0, scaleY: 0, alpha: 0,
                        duration: 300, ease: 'Power2',
                        onComplete: () => {
                            tweensCompleted++;
                            if (tweensCompleted === totalTweens) { this.clearAndRefill(uniqueItems, removedLocations); }
                        }
                    });
                } else { tweensCompleted++; if (tweensCompleted === totalTweens) { this.clearAndRefill(uniqueItems, removedLocations); } }
            } else { tweensCompleted++; if (tweensCompleted === totalTweens) { this.clearAndRefill(uniqueItems, removedLocations); } }
        });
    }
    clearAndRefill(removedItems, locations) {
        console.log("Clearing data and triggering instant replacement.");
        removedItems.forEach(itemData => {
             // Ensure grid cell is marked as empty
             if (this.grid[itemData.y] && this.grid[itemData.y][itemData.x] === itemData) {
                  this.grid[itemData.y][itemData.x] = null;
             } else {
                 // Still try to ensure the grid slot is null if coordinates are valid
                 if(this.grid[itemData.y]) this.grid[itemData.y][itemData.x] = null;
             }

             // Destroy associated Phaser objects if they exist
             if (itemData.sprite) {
                 const sprite = itemData.sprite;
                 const background = sprite.getData('background');
                 const debugText = sprite.getData('debugText');
                 if (sprite) sprite.destroy();
                 if (background) background.destroy();
                 if (debugText) debugText.destroy();
             }
             itemData.sprite = null; // Explicitly clear sprite ref
        });

        // Call the new instant replacement function
        this.generateReplacements(locations);
    }
    generateReplacements(locations) {
        let newlyGeneratedItems = [];
        const gridOffsetY = UI_AREA_HEIGHT;
        const gridXPadding = (this.game.config.width - (GRID_WIDTH * TILE_SIZE)) / 2;
        const cornerRadius = 10;

        if (locations.length === 0) { this.preventAutoMatches(newlyGeneratedItems); return; }

        locations.forEach(loc => {
            const { x, y } = loc;
            if (this.grid[y]?.[x] !== null) { return; }
            const newItemData = this.generateNonMatchingItem(x, y);
            this.grid[y][x] = newItemData;

            const tileCenterX = x * TILE_SIZE + TILE_SIZE / 2 + gridXPadding;
            const tileCenterY = y * TILE_SIZE + TILE_SIZE / 2 + gridOffsetY;
            const bgSize = TILE_SIZE * 0.9;
            const spriteSize = TILE_SIZE * 0.75;
            const textOffsetY = TILE_SIZE * 0.3;

             // --- Use Graphics for Rounded Background ---
            const graphicsX = tileCenterX - bgSize / 2;
            const graphicsY = tileCenterY - bgSize / 2;
            const backgroundGraphics = this.add.graphics({ x: graphicsX, y: graphicsY });
            backgroundGraphics.fillStyle(newItemData.color, 1);
            // backgroundGraphics.lineStyle(1, 0xaaaaaa, 1); 
            backgroundGraphics.fillRoundedRect(0, 0, bgSize, bgSize, cornerRadius);
            // backgroundGraphics.strokeRoundedRect(0, 0, bgSize, bgSize, cornerRadius);
            backgroundGraphics.setDepth(0);
            // --- End Graphics ---

            const itemSprite = this.items.create(tileCenterX, tileCenterY, SPRITE_SHEET_KEY, newItemData.spriteIndex).setDisplaySize(spriteSize, spriteSize).setInteractive().setDepth(1);
            itemSprite.clearTint();
            const debugText = this.add.text(tileCenterX, tileCenterY + textOffsetY, `${newItemData.spriteIndex + 1}`, { fontSize: '9px', fill: '#000', backgroundColor: '#fff', padding: { x: 1, y: 0 } }).setOrigin(0.5).setDepth(2);

            newItemData.sprite = itemSprite;
            itemSprite.setData('gridData', newItemData); itemSprite.setData('background', backgroundGraphics); itemSprite.setData('debugText', debugText);
            newlyGeneratedItems.push(newItemData);
        });
        this.preventAutoMatches(newlyGeneratedItems);
    }
    preventAutoMatches(newlyGeneratedItems, enableSwapOnFinish = true) {
        let loops = 0; const maxLoops = GRID_WIDTH * GRID_HEIGHT;
        while (loops < maxLoops) {
            loops++;
            const autoMatches = this.findMatches();
            if (autoMatches.length === 0) {
                // console.log("No auto-matches found.");
                break; 
            }
            const itemsToRegenerate = [...new Set(autoMatches)];
            console.log(`Auto-match detected! Regenerating ${itemsToRegenerate.length} items.`);
            if (itemsToRegenerate.length === 0) { console.warn("autoMatches > 0 but no unique items? Breaking."); break; }
            itemsToRegenerate.forEach(itemData => { this.regenerateItemColor(itemData); });
        }
        if (loops >= maxLoops) { console.error("Max loops reached in preventAutoMatches."); }
        
        if (enableSwapOnFinish) {
             // console.log("Board stable. Enabling player input.");
             this.canSwap = true; 
        } else {
             // console.log("Board stable (Initial setup or reset). Swap not enabled here.");
        }
    }
    regenerateItemColor(itemData) {
        const { x, y } = itemData;
        const originalColor = itemData.color;
        let loops = 0;

        while (loops < COLORS.length + 1) { // Try all colors + 1 safety
             loops++;
             let newColor = Phaser.Utils.Array.GetRandom(COLORS);
             if (newColor !== originalColor && !this.checkMatchAt(x, y, newColor)) {
                 // Found a safe color
                 itemData.color = newColor;
                 const background = itemData.sprite?.getData('background');
                 if (background) {
                     background.setFillStyle(newColor);
                 }
                 // console.log(`Regenerated item at (${x}, ${y}) to color ${newColor}`);
                 return; // Exit function
             }
        }
        // If we somehow tried all colors and none worked (very unlikely)
        console.warn(`Could not find a non-matching color for item at (${x}, ${y}) after ${loops} attempts.`);
        // Leave the item as is, the loop in preventAutoMatches might fix neighbors
    }

    // --- Order System Methods (Simplified) ---
    triggerWin() {
        console.log("YOU WIN!");
        this.isGameWon = true;
        this.canSwap = false; // Disable further swaps
        this.winScreenGroup.setVisible(true);

        // Listen for a single click/tap anywhere to dismiss
        this.input.once('pointerdown', this.dismissWinScreen, this);
    }
    dismissWinScreen() {
         console.log("Dismissing win screen and restarting...");
         this.winScreenGroup.setVisible(false);
         this.restartGame(); // Call the restart function
    }

    // --- NEW Game Reset Function ---
    restartGame() {
        console.log("--- RESTARTING GAME ---");
        this.isGameWon = false;
        this.completedOrders = 0;

        // Reset orders visually and data-wise
        this.gameOrders.forEach(order => {
            order.completed = false;
            // Style reset is handled in update()
        });
        this.completedOrdersText.setText(`Completed: ${this.completedOrders}/${this.totalOrdersToWin}`);

        // Clear existing grid visuals and data
        this.items.clear(true, true); // Destroy sprites, backgrounds, text
        this.grid = []; // Reset grid data array

        // Re-initialize grid
        this.refillItemGenerationBag(); // Important to refill before creating data
        this.createGridData(); // Creates data, calls preventAutoMatches(false)
        this.drawGrid(); // Redraws grid visuals

        // Enable swapping
        this.canSwap = true;
        console.log("--- GAME RESTARTED --- ");
    }
}

// Define config AFTER classes are defined
const config = {
    type: Phaser.AUTO,
    width: GRID_WIDTH * TILE_SIZE + 20, // Grid width + padding
    height: GRID_HEIGHT * TILE_SIZE + UI_AREA_HEIGHT, // Grid height + UI area height
    parent: 'phaser-game',
    backgroundColor: '#2d2d2d',
    scene: [BootScene, GameScene]
};

// Initialize the game when the window loads
window.onload = () => {
    game = new Phaser.Game(config);
}; 