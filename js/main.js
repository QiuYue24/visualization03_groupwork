// 初始化配置
const MAPBOX_TOKEN = 'pk.eyJ1IjoicWl1eXVlcWl1MjAwMiIsImEiOiJjbWFjejV3OGMwOThiMmtzaGswMWRmam16In0.8one7mciYXQt13wcK5yxHQ'; // 替换为您的token
mapboxgl.accessToken = MAPBOX_TOKEN;

// 全局变量
let pharmaData = [];
let map;

// 主初始化函数
async function init() {
  // 加载数据
  try {
    pharmaData = await d3.json('processed_data/company_city.json');
    console.log('数据加载完成，记录数:', pharmaData.length);
    
    // 初始化地图
    initMap();
    
    // 初始化公司选择器
    initCompanySelector();
    
    // 默认显示所有公司
    updateVisualization('ALL');
  } catch (error) {
    console.error('初始化失败:', error);
  }
}

// 地图初始化
function initMap() {
  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v11',
    center: [20, 40],
    zoom: 2
  });

  // 添加导航控件
  map.addControl(new mapboxgl.NavigationControl());

  // 等待地图加载完成
  map.on('load', () => {
    console.log('地图加载完成');
    
    // 添加空数据源（后续动态更新）
    map.addSource('cities', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    
    map.addSource('connections', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // 添加城市节点图层
    map.addLayer({
      id: 'cities-layer',
      type: 'circle',
      source: 'cities',
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['get', 'node_size'],
          1, 5,
          10, 20
        ],
        'circle-color': [
          'match', ['get', 'node_type'],
          'hq', '#e41a1c',
          'sub', '#377eb8',
          'mixed', '#984ea3',
          '#ccc'
        ],
        'circle-stroke-width': 1,
        'circle-stroke-color': '#fff'
      }
    });

    // 添加连接线图层
    map.addLayer({
      id: 'connections-layer',
      type: 'line',
      source: 'connections',
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': '#ff7f00',
        'line-width': [
          'interpolate', ['linear'], ['get', 'strength'],
          0, 1,
          1, 5
        ],
        'line-opacity': 0.7
      }
    });

    // 添加交互
    setupMapInteractions();
  });
}

// 初始化公司选择器
function initCompanySelector() {
  const selector = document.getElementById('company-selector');
  
  // 获取所有唯一公司名称
  const companies = [...new Set(pharmaData.map(d => d.company))];
  
  // 按公司名称排序
  companies.sort();
  
  // 填充选择器选项
  companies.forEach(company => {
    const option = document.createElement('option');
    option.value = company;
    option.textContent = company;
    selector.appendChild(option);
  });
  
  // 添加事件监听
  selector.addEventListener('change', (e) => {
    updateVisualization(e.target.value);
  });
}

// 更新可视化
function updateVisualization(selectedCompany) {
  // 过滤数据
  const filteredData = selectedCompany === 'ALL' ? 
    pharmaData : 
    pharmaData.filter(d => d.company === selectedCompany);
  
  // 更新地图
  updateMapVisualization(filteredData);
  
  // 更新信息卡片
  updateInfoCard(filteredData, selectedCompany);
  
  // 更新矩阵表格
  updateMatrixTable(filteredData);
}

// 更新地图可视化
function updateMapVisualization(data) {
  // 准备城市节点数据
  const cityNodes = prepareCityNodes(data);
  map.getSource('cities').setData(cityNodes);
  
  // 准备连接线数据
  const connections = prepareConnections(data);
  map.getSource('connections').setData(connections);
  
  // 自动调整视图
  if (data.length > 0 && data[0].hasOwnProperty('head_lng')) {
    const lng = data[0].head_lng;
    const lat = data[0].head_lat;
    map.flyTo({ center: [lng, lat], zoom: 4 });
  }
}

// 准备城市节点数据
function prepareCityNodes(data) {
  const cities = {};
  
  // 处理总部城市
  data.forEach(d => {
    const cityKey = d.Parent_City_clean;
    if (!cities[cityKey]) {
      cities[cityKey] = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.head_lng, d.head_lat] },
        properties: {
          city: cityKey,
          node_type: 'hq',
          node_size: Math.log10(d.Operating_Revenue_1000USD || 1000000) / 2
        }
      };
    }
  });
  
  // 处理子公司城市
  data.forEach(d => {
    const cityKey = d.Subsidiary_City_clean;
    if (!cities[cityKey]) {
      cities[cityKey] = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.sub_lng, d.sub_lat] },
        properties: {
          city: cityKey,
          node_type: 'sub',
          node_size: Math.log10(d.sub_Assets_millionUSD || 1000) / 2,
          parent: d.Parent_City_clean
        }
      };
    } else {
      // 如果城市既是总部又是子公司
      cities[cityKey].properties.node_type = 'mixed';
    }
  });
  
  return {
    type: 'FeatureCollection',
    features: Object.values(cities)
  };
}

// 准备连接线数据
function prepareConnections(data) {
  const features = data.map(d => ({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [d.head_lng, d.head_lat],
        [d.sub_lng, d.sub_lat]
      ]
    },
    properties: {
      strength: (d.Ownership || 50) / 100,
      parent: d.Parent_City_clean,
      subsidiary: d.Subsidiary_City_clean,
      company: d.company
    }
  }));
  
  return {
    type: 'FeatureCollection',
    features: features
  };
}

// 更新信息卡片
function updateInfoCard(data, selectedCompany) {
  const card = document.getElementById('company-info-card');
  
  if (selectedCompany === 'ALL') {
    document.getElementById('selected-company').textContent = '全部公司';
    document.getElementById('subsidiary-count').textContent = data.length;
    
    const totalAssets = d3.sum(data, d => d.sub_Assets_millionUSD || 0);
    document.getElementById('total-assets').textContent = `$${(totalAssets / 1000).toFixed(1)}B`;
    
    const avgOwnership = d3.mean(data, d => d.Ownership || 50);
    document.getElementById('avg-ownership').textContent = `${avgOwnership.toFixed(0)}%`;
  } else {
    document.getElementById('selected-company').textContent = selectedCompany;
    document.getElementById('subsidiary-count').textContent = data.length;
    
    const totalAssets = d3.sum(data, d => d.sub_Assets_millionUSD || 0);
    document.getElementById('total-assets').textContent = `$${totalAssets.toFixed(0)}M`;
    
    const avgOwnership = d3.mean(data, d => d.Ownership || 50);
    document.getElementById('avg-ownership').textContent = `${avgOwnership.toFixed(0)}%`;
  }
}

// 更新矩阵表格
function updateMatrixTable(data) {
  const tableBody = d3.select('#control-matrix tbody');
  tableBody.selectAll('tr').remove();
  
  // 按城市分组统计
  const cityStats = {};
  data.forEach(d => {
    const city = d.Subsidiary_City_clean;
    if (!cityStats[city]) {
      cityStats[city] = {
        count: 0,
        totalOwnership: 0,
        functions: new Set()
      };
    }
    cityStats[city].count++;
    cityStats[city].totalOwnership += (d.Ownership || 50);
    
    // 简单功能分类（根据NACE代码）
    if (d.sub_nace_code) {
      const func = classifyFunction(d.sub_nace_code);
      cityStats[city].functions.add(func);
    }
  });
  
  // 转换为数组并排序
  const sortedCities = Object.entries(cityStats)
    .sort((a, b) => b[1].count - a[1].count);
  
  // 填充表格
  sortedCities.forEach(([city, stats]) => {
    const row = tableBody.append('tr');
    row.append('td').text(city);
    row.append('td').text(stats.count);
    
    const avgOwnership = stats.totalOwnership / stats.count;
    row.append('td').text(`${avgOwnership.toFixed(0)}%`);
    
    const mainFunc = [...stats.functions][0] || '未知';
    row.append('td').text(mainFunc);
  });
}

// 简单功能分类
function classifyFunction(naceCode) {
  // 示例分类逻辑（需根据实际NACE代码调整）
  if (naceCode.startsWith('21')) return '药品制造';
  if (naceCode.startsWith('72')) return '研发';
  if (naceCode.startsWith('46')) return '药品批发';
  if (naceCode.startsWith('86')) return '医疗服务';
  return '其他';
}

// 设置地图交互
function setupMapInteractions() {
  // 城市悬停效果
  map.on('mouseenter', 'cities-layer', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  
  map.on('mouseleave', 'cities-layer', () => {
    map.getCanvas().style.cursor = '';
  });
  
  // 点击城市显示详情
  map.on('click', 'cities-layer', (e) => {
    const city = e.features[0].properties.city;
    const nodeType = e.features[0].properties.node_type;
    
    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`
        <h4>${city}</h4>
        <p>类型: ${getNodeTypeName(nodeType)}</p>
        ${nodeType !== 'hq' ? `<p>控制方: ${e.features[0].properties.parent || '未知'}</p>` : ''}
      `)
      .addTo(map);
  });
}

// 辅助函数：获取节点类型名称
function getNodeTypeName(type) {
  const names = {
    'hq': '总部',
    'sub': '子公司',
    'mixed': '混合型(总部+子公司)'
  };
  return names[type] || type;
}

// 启动应用
document.addEventListener('DOMContentLoaded', init);