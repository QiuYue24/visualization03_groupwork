// 配置
const MAPBOX_TOKEN = 'pk.eyJ1IjoicWl1eXVlcWl1MjAwMiIsImEiOiJjbWFjejV3OGMwOThiMmtzaGswMWRmam16In0.8one7mciYXQt13wcK5yxHQ'; // 替换为您的token
mapboxgl.accessToken = MAPBOX_TOKEN;

// 全局变量
let pharmaData = [];
let map;

// DOM元素
const dom = {
    loading: document.getElementById('loading'),
    companySelector: document.getElementById('company-selector'),
    selectedCompany: document.getElementById('selected-company'),
    subsidiaryCount: document.getElementById('subsidiary-count'),
    totalAssets: document.getElementById('total-assets'),
    avgOwnership: document.getElementById('avg-ownership'),
    matrixBody: document.querySelector('#control-matrix tbody')
};

// 主初始化
document.addEventListener('DOMContentLoaded', async () => {
    showLoading(true);
    try {
        await initMap();
        await loadData();
        initCompanySelector();
        updateVisualization('ALL');
    } catch (error) {
        console.error('初始化失败:', error);
        alert(`初始化失败: ${error.message}`);
    } finally {
        showLoading(false);
    }
});

// 地图初始化
async function initMap() {
    return new Promise((resolve) => {
        map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/light-v11',
            center: [20, 40],
            zoom: 3
        });

        map.addControl(new mapboxgl.NavigationControl());

        map.on('load', () => {
            // 数据源
            map.addSource('cities', { type: 'geojson', data: emptyGeoJSON() });
            map.addSource('connections', { type: 'geojson', data: emptyGeoJSON() });

            // 图层
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
                    'line-width': ['interpolate', ['linear'], ['get', 'strength'], 0, 1, 1, 5],
                    'line-opacity': 0.7
                }
            });

            map.addLayer({
                id: 'subsidiary-layer',
                type: 'circle',
                source: 'cities',
                filter: ['==', ['get', 'node_type'], 'sub'],
                paint: {
                    'circle-radius': ['interpolate', ['linear'], ['get', 'node_size'], 1, 4, 10, 12],
                    'circle-color': '#377eb8',
                    'circle-stroke-width': 0
                }
                });

            map.addLayer({
                id: 'mixed-layer',
                type: 'circle',
                source: 'cities',
                filter: ['==', ['get', 'node_type'], 'mixed'],
                paint: {
                    'circle-radius': ['interpolate', ['linear'], ['get', 'node_size'], 1, 5, 10, 18],
                    'circle-color': '#984ea3',
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#fff'
                }
                });
                  
            map.addLayer({
                id: 'hq-layer',
                type: 'circle',
                source: 'cities',
                filter: ['==', ['get', 'node_type'], 'hq'],
                paint: {
                    'circle-radius': ['interpolate', ['linear'], ['get', 'node_size'], 1, 5, 10, 18],
                    'circle-color': '#e41a1c',
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#fff'
                }
                });
                  


            // 交互
            setupMapInteractions();
            resolve();
        });
    });
}

// 数据加载
async function loadData() {
    const rawData = await d3.json('processed_data/company_city.json');
  
    // 步骤 1：先筛选总部在美国、NACE 行业以 21 开头的行
    const usPharmaHqRows = rawData.filter(d =>
      d.Country_head === 'US' &&
      d.NACE_Core_Code?.toString().startsWith('21')
    );
  
    // 步骤 2：按公司名 + 总部城市去重，得到唯一的主公司记录
    const uniqueCompanies = Array.from(
      d3.group(usPharmaHqRows, d => d.company)
    ).map(([company, records]) => {
      // 每组中选一个营收最大的行
      return records.sort((a, b) => (b.Operating_Revenue_1000USD || 0) - (a.Operating_Revenue_1000USD || 0))[0];
    });
  
    // 步骤 3：排序并保留前 20 家主公司
    const top20Companies = uniqueCompanies
      .sort((a, b) => (b.Operating_Revenue_1000USD || 0) - (a.Operating_Revenue_1000USD || 0))
      .slice(0, 20)
      .map(d => d.company);  // 仅保留公司名称
  
    // 步骤 4：重新过滤出前 20 家公司的所有行（包括子公司）
    pharmaData = rawData.filter(d => top20Companies.includes(d.company));
  
    // 步骤 5：给缺失资产值的公司补默认值
    pharmaData.forEach(d => {
      d.sub_Assets_millionUSD = d.sub_Assets_millionUSD ||
        Math.max(1, Math.round((d.Operating_Revenue_1000USD || 0) / 10000));
    });
  }
  

// 公司选择器
function initCompanySelector() {
    dom.companySelector.innerHTML = '';
  
    const allOption = document.createElement('option');
    allOption.value = 'ALL';
    allOption.textContent = '全部前20大公司';
    dom.companySelector.appendChild(allOption);
  
    // ✅ 去重公司名
    const uniqueCompanies = [...new Set(pharmaData.map(d => d.company))];
  
    uniqueCompanies.forEach(companyName => {
      const option = document.createElement('option');
      option.value = companyName;
      option.textContent = companyName;
      dom.companySelector.appendChild(option);
    });
  
    dom.companySelector.addEventListener('change', (e) => {
      updateVisualization(e.target.value);
    });
  }  

// 更新可视化
function updateVisualization(selectedCompany) {
    const filteredData = selectedCompany === 'ALL' ?
        pharmaData :
        pharmaData.filter(d => d.company === selectedCompany);

    updateMap(filteredData);
    updateInfoCard(filteredData, selectedCompany);
    updateMatrixTable(filteredData);
}

// 更新地图
function updateMap(data) {
    if (!map.getSource('cities')) return;

    map.getSource('cities').setData({
        type: 'FeatureCollection',
        features: prepareCityFeatures(data)
    });

    map.getSource('connections').setData({
        type: 'FeatureCollection',
        features: prepareConnectionFeatures(data)
    });

    if (data[0]?.head_lng) {
        map.flyTo({
            center: [data[0].head_lng, data[0].head_lat],
            zoom: 4
        });
    }
}

// 数据准备
function prepareCityFeatures(data) {
    const features = [];
    const cityMap = new Set();

    data.forEach(d => {
        // 总部
        if (d.Parent_City_clean && !cityMap.has(`hq-${d.Parent_City_clean}`)) {
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [d.head_lng, d.head_lat] },
                properties: {
                    city: d.Parent_City_clean,
                    node_type: 'hq',
                    node_size: Math.log10(d.Operating_Revenue_1000USD || 1000000) / 2
                }
            });
            cityMap.add(`hq-${d.Parent_City_clean}`);
        }

        // 子公司
        if (d.Subsidiary_City_clean) {
            const isMixed = cityMap.has(`sub-${d.Subsidiary_City_clean}`);
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [d.sub_lng, d.sub_lat] },
                properties: {
                    city: d.Subsidiary_City_clean,
                    node_type: isMixed ? 'mixed' : 'sub',
                    node_size: Math.log10(d.sub_Assets_millionUSD || 1000) / 2,
                    parent: d.Parent_City_clean
                }
            });
            cityMap.add(`sub-${d.Subsidiary_City_clean}`);
        }
    });

    return features;
}

function prepareConnectionFeatures(data) {
    return data.map(d => ({
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates: [[d.head_lng, d.head_lat], [d.sub_lng, d.sub_lat]]
        },
        properties: {
            strength: (d.Ownership || 50) / 100,
            parent: d.Parent_City_clean,
            subsidiary: d.Subsidiary_City_clean
        }
    }));
}

// 更新信息卡片
function updateInfoCard(data, selectedCompany) {
    dom.selectedCompany.textContent = selectedCompany === 'ALL' ? '前20大公司汇总' : selectedCompany;
    dom.subsidiaryCount.textContent = data.length;

    const totalAssets = d3.sum(data, d => d.sub_Assets_millionUSD || 0);
    dom.totalAssets.textContent = selectedCompany === 'ALL' ?
        `$${(totalAssets / 1000).toFixed(1)}B` :
        `$${Math.round(totalAssets)}M`;

    const avgOwnership = d3.mean(data, d => d.Ownership || 50);
    dom.avgOwnership.textContent = `${Math.round(avgOwnership)}%`;
}

// 更新矩阵表格
function updateMatrixTable(data) {
    dom.matrixBody.innerHTML = '';

    const cityStats = data.reduce((acc, d) => {
        if (!d.Subsidiary_City_clean) return acc;

        if (!acc[d.Subsidiary_City_clean]) {
            acc[d.Subsidiary_City_clean] = { count: 0, ownership: 0, functions: new Set() };
        }

        acc[d.Subsidiary_City_clean].count++;
        acc[d.Subsidiary_City_clean].ownership += (d.Ownership || 50);
        acc[d.Subsidiary_City_clean].functions.add(classifyFunction(d.sub_nace_code));

        return acc;
    }, {});

    Object.entries(cityStats)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 30)
        .forEach(([city, stats]) => {
            const row = dom.matrixBody.insertRow();
            row.insertCell(0).textContent = city;
            row.insertCell(1).textContent = stats.count;
            row.insertCell(2).textContent = `${Math.round(stats.ownership / stats.count)}%`;
            row.insertCell(3).textContent = [...stats.functions][0] || '未知';
        });
}

// 辅助函数
function classifyFunction(naceCode) {
    if (!naceCode) return '未知';
    const code = parseInt(naceCode);

    if (code >= 2100 && code < 2200) return '药品制造';
    if (code >= 7200 && code < 7300) return '研发';
    if (code >= 4600 && code < 4700) return '批发贸易';
    if (code === 2120) return '处方药制造';
    if (code === 4646) return '药品批发';
    return '其他';
}

function emptyGeoJSON() {
    return { type: 'FeatureCollection', features: [] };
}

function showLoading(show) {
    dom.loading.style.display = show ? 'block' : 'none';
}

function setupMapInteractions() {
    // ✅ 在函数开头创建共享 popup 实例
    const sharedPopup = new mapboxgl.Popup({ closeOnClick: true });
  
    ['subsidiary-layer', 'mixed-layer', 'hq-layer'].forEach(layerId => {
      map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
  
      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
      });
  
       map.on('click', layerId, (e) => {
      const feature = e.features[0];
      const props = feature.properties;

      // ✅ 1. 显示原先的 Popup
      sharedPopup
        .setLngLat(e.lngLat)
        .setHTML(`
          <h4>${props.city}</h4>
          <p>类型: ${getNodeTypeName(props.node_type)}</p>
          ${props.parent ? `<p>控制方: ${props.parent}</p>` : ''}
          <p>节点大小: ${(+props.node_size).toFixed(2)}</p>
        `)
        .addTo(map);

      // ✅ 2. 显示该城市对应的 NACE 饼图
      const clickedCity = (props.city || '').trim().toUpperCase();

      const cityData = pharmaData.filter(d =>
        (d.Subsidiary_City_clean || '').trim().toUpperCase() === clickedCity
      );

      if (!cityData.length) {
        Plotly.purge('pie-chart');
        return;
      }

      const naceCounts = {};
      cityData.forEach(d => {
        const code = d.sub_nace_code ? d.sub_nace_code.toString() : '未知';
        naceCounts[code] = (naceCounts[code] || 0) + 1;
      });

      const labels = Object.keys(naceCounts);
      const values = Object.values(naceCounts);

      Plotly.newPlot('pie-chart', [{
        type: 'pie',
        labels: labels,
        values: values,
        textinfo: 'label+percent',
        hole: 0.45,
        pull: 0.02, // 各部分略微分离
        marker: {
            line: {
                color: '#fff',
                width: 2
            }
        }
    }], {
        title: {
            text: `NACE 类型分布 - ${clickedCity}`,
            font: { size: 18 }
        },
        height: 300,
        width: 300,
        showlegend: true,
        legend: {
            orientation: 'v',
            x: 1,
            y: 0.5,
            font: { size: 12 }
        },
        margin: { t: 40, b: 20, l: 20, r: 60 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)'
    });
    });
  });
}
  


function getNodeTypeName(type) {
    const names = { hq: '总部', sub: '子公司', mixed: '混合型' };
    return names[type] || type;
}